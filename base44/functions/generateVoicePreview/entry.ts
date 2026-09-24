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

    const { contextB64, signature } = await signContext(launchContext, ssoSecret);

    // Try Studio's /api/auth/launch endpoint with the SSO secret as api_key
    // This endpoint exchanges the signed SSO context for a Base44 access token
    const launchRes = await fetch(
      `${studioBaseUrl}/api/auth/launch?ctx=${contextB64}&sig=${signature}&api_key=${encodeURIComponent(ssoSecret)}`,
      {
        headers: {
          'Accept': 'application/json',
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

    // Extract the access token from the launch response
    const studioToken = launchData.access_token || launchData.token || launchData.data?.access_token;

    if (!studioToken) {
      return Response.json({
        error: 'Studio auth/launch did not return an access token',
        launch_data: launchData,
      }, { status: 502 });
    }

    // Call Studio's generateVoicePreview with the Studio access token
    const previewRes = await fetch(`${studioBaseUrl}/functions/generateVoicePreview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studioToken}`,
      },
      body: JSON.stringify({
        text: text || `Hi, I'm ${voice_name.replace(/\s*\(.*?\)\s*/g, '')}. This is a preview of my voice for your real estate productions.`,
        voice_name,
        language_code: language_code || 'en-US',
        provider: provider || undefined,
        voice_id: voice_id || undefined,
        provider_voice_id: provider_voice_id || undefined,
      }),
    });

    const previewData = await previewRes.json().catch(() => ({}));

    if (!previewRes.ok) {
      return Response.json({
        error: previewData.error || `Studio returned ${previewRes.status}`,
      }, { status: previewRes.status });
    }

    return Response.json({
      audio_url: previewData.audio_url || previewData.data?.audio_url || previewData.data?.audio_data_url,
      audio_data_url: previewData.audio_data_url || previewData.data?.audio_data_url,
      source: 'arriv_studio',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}