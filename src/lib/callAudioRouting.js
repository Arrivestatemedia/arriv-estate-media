/**
 * Call audio routing.
 *
 * A phone browser gives a page no "earpiece or loudspeaker" switch of the kind a
 * native dialer has, so two mechanisms are used instead:
 *
 *  1. The Audio Session API (Safari on iOS/macOS 16.4+). While a page holds the
 *     microphone, iOS sends the call audio to the loudspeaker by default.
 *     Declaring the page as 'play-and-record' puts a call back on the handset
 *     route, and returning it to 'auto' hands routing back to the browser.
 *  2. The Twilio SDK's own output list, on browsers that expose a separate
 *     earpiece and loudspeaker and support setSinkId.
 *
 * Both are best-effort: where a browser offers neither, the phone decides.
 */

const EARPIECE = /earpiece|receiver|handset/i;
const SPEAKER = /speaker|loud/i;

const audioSession = () => (typeof navigator !== "undefined" ? navigator.audioSession : null);

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

/** Put an active call on the handset route (earpiece). */
export const routeCallToEarpiece = async (device) => {
  const switched = await selectOutput(device, outputId(device, EARPIECE));
  setSessionType("play-and-record");
  return switched;
};

/** Put an active call on the loudspeaker. */
export const routeCallToSpeaker = async (device) => {
  const switched = await selectOutput(device, outputId(device, SPEAKER));
  setSessionType("auto");
  return switched;
};

/** Restore normal media routing once the call is over. */
export const releaseCallAudio = () => {
  setSessionType("playback");
  setSessionType("auto");
};