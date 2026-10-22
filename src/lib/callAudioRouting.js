/**
 * Call audio routing.
 *
 * A phone browser gives a page no "earpiece or loudspeaker" switch of the kind a
 * native dialer has. The one lever Safari exposes is the Audio Session API:
 * declaring the page as 'play-and-record' (a call, rather than plain media)
 * sends the call audio to the handset receiver, and is the only way a web app
 * can keep a call off the loudspeaker on iOS.
 *
 * WebKit reads the microphone capture state when it applies that declaration, so
 * applying it once as the call connects can land before capture has begun. It is
 * therefore applied again a moment later.
 *
 * Twilio's own output list is used as well, on browsers that expose a separate
 * receiver and loudspeaker.
 *
 * All of it is best-effort: where a browser offers neither, the phone decides.
 */

const EARPIECE = /earpiece|receiver|handset/i;
const SPEAKER = /speaker|loud/i;
const REASSERT_MS = 900;

let reassertTimer = null;

/** True on a phone or tablet, where call audio is routed to a receiver or speaker. */
export const isPhoneDevice = typeof navigator !== "undefined"
  && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const audioSession = () => (typeof navigator !== "undefined" ? navigator.audioSession : null);

/** Whether this browser lets the app choose the call output at all. */
export const canControlCallOutput = () => Boolean(audioSession());

const setSessionType = (type) => {
  const session = audioSession();
  if (!session) return false;
  try {
    session.type = type;
    return session.type === type;
  } catch {
    return false;
  }
};

// Device id of the first Twilio output whose label looks like the requested route.
const outputId = (device, pattern) => {
  const outputs = device?.audio?.availableOutputDevices;
  if (!outputs || typeof outputs.forEach !== "function") return null;
  let found = null;
  outputs.forEach((info, id) => {
    if (found === null && pattern.test(info?.label || "")) found = id;
  });
  return found;
};

const selectOutput = async (device, id) => {
  if (!id) return false;
  try {
    await device.audio.speakerDevices.set(id);
    return true;
  } catch {
    return false;
  }
};

// Declaring 'auto' first makes WebKit treat the next value as a fresh route
// decision instead of skipping a value it already holds.
const applyHandsetRoute = () => {
  setSessionType("auto");
  setSessionType("play-and-record");
};

const clearReassert = () => {
  if (reassertTimer) {
    clearTimeout(reassertTimer);
    reassertTimer = null;
  }
};

/** Put an active call on the handset route (earpiece). */
export const routeCallToEarpiece = async (device) => {
  await selectOutput(device, outputId(device, EARPIECE));
  applyHandsetRoute();
  clearReassert();
  reassertTimer = setTimeout(applyHandsetRoute, REASSERT_MS);
};

/** Put an active call on the loudspeaker. */
export const routeCallToSpeaker = async (device) => {
  clearReassert();
  await selectOutput(device, outputId(device, SPEAKER));
  setSessionType("auto");
};

/** Restore normal media routing once the call is over. */
export const releaseCallAudio = () => {
  clearReassert();
  setSessionType("playback");
  setSessionType("auto");
};