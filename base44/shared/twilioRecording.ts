/**
 * Twilio Video server-side recording helpers.
 * Uses raw fetch calls to the Twilio REST API (same pattern as makeTwilioCall)
 * to avoid the twilio npm package's Deno-incompatible fetch options.
 *
 * Creates rooms with RecordParticipantsOnConnect=true and handles
 * composition creation after rooms end — the server-side backup recording
 * for human interviews, parallel to Tavus auto_start_recording for AI interviews.
 */

const TWILIO_VIDEO_BASE = 'https://video.twilio.com/v1';

function getAuthHeader(): string {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  return 'Basic ' + btoa(`${sid}:${token}`);
}

export function getRecordingCallbackUrl(): string {
  let domain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
  if (!domain.startsWith('http')) domain = `https://${domain}`;
  domain = domain.replace(/\/$/, '');
  return `${domain}/functions/twilioRecordingCallback`;
}

/** Create a Twilio Video room with server-side recording enabled. */
export async function createRecordingRoom(roomName: string) {
  const callbackUrl = getRecordingCallbackUrl();
  const params = new URLSearchParams();
  params.append('UniqueName', roomName);
  params.append('Type', 'group');
  params.append('RecordParticipantsOnConnect', 'true');
  params.append('StatusCallback', callbackUrl);
  params.append('StatusCallbackMethod', 'POST');

  const response = await fetch(`${TWILIO_VIDEO_BASE}/Rooms`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const data = await response.json();

  if (!response.ok) {
    const err: any = new Error(data.message || 'Failed to create Twilio room');
    err.code = data.code;
    err.status = data.status;
    throw err;
  }

  return { sid: data.sid, uniqueName: data.unique_name, status: data.status };
}

/** Create a Composition to combine individual recordings into a single video. */
export async function createComposition(roomSid: string) {
  const callbackUrl = getRecordingCallbackUrl();
  const params = new URLSearchParams();
  params.append('RoomSid', roomSid);
  params.append('AudioSources', '*');
  params.append('VideoLayout', JSON.stringify({ main: { video_sources: ['*'] } }));
  params.append('Resolution', '1280x720');
  params.append('Format', 'mp4');
  params.append('StatusCallback', callbackUrl);
  params.append('StatusCallbackMethod', 'POST');

  const response = await fetch(`${TWILIO_VIDEO_BASE}/Compositions`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const data = await response.json();

  if (!response.ok) {
    const err: any = new Error(data.message || 'Failed to create composition');
    err.code = data.code;
    err.status = data.status;
    throw err;
  }

  return { sid: data.sid, roomSid: data.room_sid, status: data.status };
}

/** Get a fresh download URL for a composition's media. */
export async function getCompositionMediaUrl(compositionSid: string): Promise<string | null> {
  // Step 1: Fetch the composition resource to get the media link
  const compResponse = await fetch(`${TWILIO_VIDEO_BASE}/Compositions/${compositionSid}`, {
    method: 'GET',
    headers: { 'Authorization': getAuthHeader() },
  });

  if (!compResponse.ok) {
    console.warn('Failed to fetch composition resource:', compResponse.status);
    return null;
  }

  const compData = await compResponse.json();
  const mediaLink = compData.links?.media;

  if (!mediaLink) {
    console.warn('No media link in composition resource');
    return null;
  }

  // Step 2: Follow the redirect to get the temporary S3 URL
  // Try manual redirect first (avoids downloading the video body)
  try {
    const manualResponse = await fetch(mediaLink, {
      method: 'GET',
      headers: { 'Authorization': getAuthHeader() },
      redirect: 'manual',
    });

    if (manualResponse.status >= 300 && manualResponse.status < 400) {
      const location = manualResponse.headers.get('Location');
      if (location) return location;
    }

    // If manual didn't return a redirect, try following and cancel the body immediately
    if (manualResponse.status === 200) {
      const followResponse = await fetch(mediaLink, {
        method: 'GET',
        headers: { 'Authorization': getAuthHeader() },
        redirect: 'follow',
      });
      await followResponse.body?.cancel();
      if (followResponse.url && followResponse.url !== mediaLink) {
        return followResponse.url;
      }
    }
  } catch (e) {
    console.warn('Failed to follow media redirect:', e.message);
  }

  // Fallback: return the authenticated media link (requires Twilio credentials to download)
  return mediaLink;
}