import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Proxies voice preview generation to the canonical Arriv Studio backend.
// Uses a workspace personal access token (PAT) with "All apps" access to
// authenticate cross-app function calls. The PAT provides the user context
// that Studio's generateVoicePreview function requires.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { voice_name, language_code, text, provider, voice_id, provider_voice_id } = body;

    if (!voice_name) {
      return Response.json({ error: 'voice_name is required' }, { status: 400 });
    }

    const studioBaseUrl = (secrets.get('ARRIV_STUDIO_BASE_URL') || '').replace(/\/$/, '');

    if (!studioBaseUrl) {
      return Response.json({ error: 'Arriv Studio is not configured' }, { status: 503 });
    }

    const previewPayload = {
      text: text || `Hi, I'm ${voice_name.replace(/\s*\(.*?\)\s*/g, '')}. This is a preview of my voice for your real estate productions.`,
      voice_name,
      language_code: language_code || 'en-US',
      provider: provider || undefined,
      voice_id: voice_id || undefined,
      provider_voice_id: provider_voice_id || undefined,
    };

    // Strategy 1: Workspace PAT with "All apps" access — authenticates as the
    // PAT owner and provides the user context Studio's function needs.
    const pat = secrets.get('ARRIV_STUDIO_PAT');
    if (pat) {
      const patRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pat}`,
        },
        body: JSON.stringify(previewPayload),
      });

      const patData = await patRes.json().catch(() => ({}));
      const audioUrl = patData.audio_url || patData.data?.audio_url || patData.data?.audio_data_url;

      if (patRes.ok && audioUrl) {
        return Response.json({
          audio_url: audioUrl,
          audio_data_url: patData.audio_data_url || patData.data?.audio_data_url,
          source: 'arriv_studio',
        });
      }

      const patErr = patData.error || patData.message || '';
      // Non-auth errors are real failures — return them
      if (patRes.status !== 401 && !patErr.includes('Unauthorized') && patErr !== 'Authentication required to view users') {
        return Response.json({
          error: patErr || `Studio returned ${patRes.status}`,
          status: patRes.status,
        }, { status: patRes.status });
      }
    }

    // Strategy 2: Forward the user's own Base44 token (works if user is
    // authenticated in both apps via workspace SSO).
    const userAuthHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (userAuthHeader) {
      const userRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': userAuthHeader,
        },
        body: JSON.stringify(previewPayload),
      });

      const userData = await userRes.json().catch(() => ({}));
      const audioUrl = userData.audio_url || userData.data?.audio_url || userData.data?.audio_data_url;

      if (userRes.ok && audioUrl) {
        return Response.json({
          audio_url: audioUrl,
          audio_data_url: userData.audio_data_url || userData.data?.audio_data_url,
          source: 'arriv_studio',
        });
      }

      const userErr = userData.error || userData.message || '';
      if (userRes.status !== 401 && !userErr.includes('Unauthorized') && userErr !== 'Authentication required to view users') {
        return Response.json({
          error: userErr || `Studio returned ${userRes.status}`,
          status: userRes.status,
        }, { status: userRes.status });
      }
    }

    // No strategy succeeded
    return Response.json({
      error: 'Unable to authenticate with Arriv Studio. Ensure the ARRIV_STUDIO_PAT secret is set to a workspace personal access token with "All apps" access and "run functions" permission.',
    }, { status: 502 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}