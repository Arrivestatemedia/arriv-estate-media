import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Proxies voice preview generation to the canonical Arriv Studio backend.
// Uses the shared SSO secret to authenticate against Studio's generateVoicePreview function.

async function signContext(context, ssoSecret) {
  const contextJson = JSON.stringify(context);
  const encoder = new TextEncoder();
  const contextBytes = encoder.encode(contextJson);
  const contextB64 = btoa(String.fromCharCode(...contextBytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  let signature = '';
  if (ssoSecret) {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(ssoSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(contextB64));
    signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return { contextB64, signature };
}

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
    const ssoSecret = secrets.get('ARRIV_STUDIO_SSO_SECRET');

    if (!studioBaseUrl) {
      return Response.json({ error: 'Arriv Studio is not configured' }, { status: 503 });
    }

    const clientEmail = (user.email || '').toLowerCase();

    // Build SSO launch context (same format as launchArrivStudio)
    const launchContext = {
      source_product: 'ESTATE_MEDIA',
      industry_context: 'REAL_ESTATE',
      organization_id: `estate_media_${clientEmail}`,
      user_email: clientEmail,
      user_name: user.full_name || user.email,
      studio_section: 'libraries',
      embedded: true,
      launched_at: new Date().toISOString(),
    };

    // Strategy 1: Try calling Studio's generateVoicePreview with the user's
    // own Base44 access token (forwarded from the Estate Media frontend).
    // Base44 user tokens may be valid across apps in the same workspace.
    const userAuthHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const previewPayload = {
      text: text || `Hi, I'm ${voice_name.replace(/\s*\(.*?\)\s*/g, '')}. This is a preview of my voice for your real estate productions.`,
      voice_name,
      language_code: language_code || 'en-US',
      provider: provider || undefined,
      voice_id: voice_id || undefined,
      provider_voice_id: provider_voice_id || undefined,
    };

    if (userAuthHeader) {
      const directRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': userAuthHeader,
        },
        body: JSON.stringify(previewPayload),
      });

      const directData = await directRes.json().catch(() => ({}));

      if (directRes.ok && (directData.audio_url || directData.data?.audio_url || directData.data?.audio_data_url)) {
        return Response.json({
          audio_url: directData.audio_url || directData.data?.audio_url || directData.data?.audio_data_url,
          audio_data_url: directData.audio_data_url || directData.data?.audio_data_url,
          source: 'arriv_studio',
        });
      }

      // If non-auth error, return it; otherwise fall through to service token
      const directErr = directData.error || directData.message || '';
      if (directRes.status !== 401 && !directErr.includes('Unauthorized') && !directErr.includes('auth')) {
        return Response.json({
          error: directErr || `Studio returned ${directRes.status}`,
          status: directRes.status,
        }, { status: directRes.status });
      }
    }

    // Strategy 1b: Try with the Estate Media service token
    const serviceToken = secrets.get('BASE44_SERVICE_TOKEN');
    if (serviceToken) {
      const svcRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceToken}`,
        },
        body: JSON.stringify(previewPayload),
      });

      const svcData = await svcRes.json().catch(() => ({}));

      if (svcRes.ok && (svcData.audio_url || svcData.data?.audio_url || svcData.data?.audio_data_url)) {
        return Response.json({
          audio_url: svcData.audio_url || svcData.data?.audio_url || svcData.data?.audio_data_url,
          audio_data_url: svcData.audio_data_url || svcData.data?.audio_data_url,
          source: 'arriv_studio',
        });
      }

      const svcErr = svcData.error || svcData.message || '';
      if (svcRes.status !== 401 && !svcErr.includes('Unauthorized') && svcErr !== 'Authentication required to view users') {
        return Response.json({
          error: svcErr || `Studio returned ${svcRes.status}`,
          status: svcRes.status,
        }, { status: svcRes.status });
      }
    }

    // Strategy 2: SSO launch flow — exchange signed context for a Studio token
    const { contextB64, signature } = await signContext(launchContext, ssoSecret);

    const launchRes = await fetch(
      `${studioBaseUrl}/api/auth/launch?ctx=${contextB64}&sig=${signature}`,
      {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${ssoSecret}`,
        },
      }
    );

    const launchData = await launchRes.json().catch(() => ({}));

    if (!launchRes.ok) {
      return Response.json({
        error: `Studio auth/launch failed: ${launchData.error || launchData.message || launchRes.status}`,
        launch_status: launchRes.status,
        launch_data: launchData,
      }, { status: 502 });
    }

    const studioToken = launchData.access_token || launchData.token || launchData.data?.access_token;

    if (!studioToken) {
      return Response.json({
        error: 'Studio auth/launch did not return an access token',
        launch_data: launchData,
      }, { status: 502 });
    }

    // Call Studio's generateVoicePreview with the Studio access token
    const ssoPreviewRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studioToken}`,
      },
      body: JSON.stringify(previewPayload),
    });

    const ssoPreviewData = await ssoPreviewRes.json().catch(() => ({}));

    if (!ssoPreviewRes.ok) {
      return Response.json({
        error: ssoPreviewData.error || `Studio returned ${ssoPreviewRes.status}`,
      }, { status: ssoPreviewRes.status });
    }

    return Response.json({
      audio_url: ssoPreviewData.audio_url || ssoPreviewData.data?.audio_url || ssoPreviewData.data?.audio_data_url,
      audio_data_url: ssoPreviewData.audio_data_url || ssoPreviewData.data?.audio_data_url,
      source: 'arriv_studio',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}