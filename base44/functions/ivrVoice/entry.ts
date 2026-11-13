/**
 * ivrVoice — serves one spoken IVR line as ElevenLabs audio.
 *
 * Called only by TwiML this app generates: the URL is signed, so nobody can
 * spend the account's ElevenLabs characters by hitting this endpoint directly.
 * Generated audio is cached in memory, so a repeated prompt (greeting, menu,
 * overflow message) is generated once and replayed from cache afterwards.
 */

import { ivrVoiceReady, verifyIvrVoiceSignature } from '../../shared/ivrVoice.ts';

const cache = new Map<string, Uint8Array>();

function audio(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const text = params.get('t') || '';
  const signature = params.get('s') || '';

  if (!text || !verifyIvrVoiceSignature(text, signature)) {
    return new Response('forbidden', { status: 403 });
  }
  if (!ivrVoiceReady()) {
    return new Response('voice not configured', { status: 404 });
  }

  const cached = cache.get(text);
  if (cached) return audio(cached);

  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || '';
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY') || '';

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      console.error('[ivrVoice] elevenlabs error', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return new Response('voice unavailable', { status: 502 });
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (cache.size > 120) cache.clear();
    cache.set(text, bytes);
    return audio(bytes);
  } catch (error) {
    console.error('[ivrVoice] fatal:', (error as Error).message);
    return new Response('voice unavailable', { status: 502 });
  }
});