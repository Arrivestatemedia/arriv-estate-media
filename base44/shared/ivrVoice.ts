/**
 * ElevenLabs voice for the IVR.
 *
 * Only the spoken voice changes: every prompt is still produced by say() and
 * every menu, digit, speech intent and routing decision is untouched. When no
 * ElevenLabs key or voice is configured, say() falls back to the Twilio voice.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function ivrVoiceReady(): boolean {
  return !!Deno.env.get('ELEVENLABS_API_KEY') && !!Deno.env.get('ELEVENLABS_VOICE_ID');
}

function voiceSecret(): string {
  return Deno.env.get('ARRIV_ESTATE_MEDIA_SECRET') || Deno.env.get('ELEVENLABS_SECRET_SALT') || 'arriv-ivr-voice';
}

export function ivrVoiceSignature(text: string): string {
  return createHmac('sha256', voiceSecret()).update(text).digest('base64url').slice(0, 32);
}

export function verifyIvrVoiceSignature(text: string, signature: string): boolean {
  const expected = ivrVoiceSignature(text);
  if (!signature || signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function ivrVoiceUrl(base: string, text: string): string {
  return `${base}/functions/ivrVoice?t=${encodeURIComponent(text)}&s=${ivrVoiceSignature(text)}`;
}