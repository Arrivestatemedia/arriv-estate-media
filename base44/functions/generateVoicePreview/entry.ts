import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Generates a voice preview using the platform's built-in TTS (Core.GenerateSpeech).
// Maps each Studio voice to the closest matching TTS voice and language.

const VOICE_MAP = {
  'aria': { tts_voice: 'honey', label: 'warm' },
  'marcus': { tts_voice: 'storm', label: 'authoritative' },
  'sophie': { tts_voice: 'sunny', label: 'bright' },
  'james': { tts_voice: 'river', label: 'calm' },
  'lena': { tts_voice: 'sunny', label: 'friendly' },
};

function getTtsVoice(voiceName) {
  const key = (voiceName || '').toLowerCase().split(/\s|\(/)[0];
  return VOICE_MAP[key] || { tts_voice: 'river', label: 'neutral' };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { voice_name, language_code, text, voice_id } = body;

    if (!voice_name) {
      return Response.json({ error: 'voice_name is required' }, { status: 400 });
    }

    const ttsVoice = getTtsVoice(voice_name);
    const previewText = text || `Hi, I'm ${voice_name.replace(/\s*\(.*?\)\s*/g, '')}. This is a preview of my voice for your real estate productions.`;

    const result = await base44.integrations.Core.GenerateSpeech({
      text: previewText.slice(0, 500),
      voice: ttsVoice.tts_voice,
      language_code: language_code || undefined,
    });

    const audioUrl = result?.data?.url || result?.url;
    if (!audioUrl) {
      return Response.json({ error: 'TTS generation returned no audio URL' }, { status: 500 });
    }

    return Response.json({
      audio_url: audioUrl,
      voice: ttsVoice.tts_voice,
      text: previewText,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}