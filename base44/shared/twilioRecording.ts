/**
 * Twilio Video server-side recording helpers.
 * Creates rooms with RecordParticipantsOnConnect=true and handles
 * composition creation after rooms end — the server-side backup recording
 * for human interviews, parallel to Tavus auto_start_recording for AI interviews.
 */

export async function getTwilioClient() {
  const twilio = await import('npm:twilio@5.3.3').then(m => m.default);
  return twilio(Deno.env.get('TWILIO_ACCOUNT_SID'), Deno.env.get('TWILIO_AUTH_TOKEN'));
}

export function getRecordingCallbackUrl() {
  const domain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
  return `${domain}/functions/twilioRecordingCallback`;
}

/** Create a Twilio Video room with server-side recording enabled. */
export async function createRecordingRoom(roomName: string) {
  const client = await getTwilioClient();
  const room = await client.video.rooms.create({
    uniqueName: roomName,
    type: 'group',
    recordParticipantsOnConnect: true,
    statusCallback: getRecordingCallbackUrl(),
    statusCallbackMethod: 'POST',
  });
  return room; // { sid, uniqueName, status, ... }
}

/** Create a Composition to combine individual recordings into a single video. */
export async function createComposition(roomSid: string) {
  const client = await getTwilioClient();
  const composition = await client.video.compositions.create({
    roomSid: roomSid,
    audioSources: ['*'],
    videoLayout: { main: { video_sources: ['*'] } },
    resolution: '1280x720',
    format: 'mp4',
    statusCallback: getRecordingCallbackUrl(),
    statusCallbackMethod: 'POST',
  });
  return composition; // { sid, roomSid, status, ... }
}

/** Get a fresh download URL for a composition's media. */
export async function getCompositionMediaUrl(compositionSid: string) {
  const client = await getTwilioClient();
  const composition = await client.video.compositions(compositionSid).fetch();
  return composition.links?.media || null;
}