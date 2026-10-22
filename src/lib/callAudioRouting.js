/**
 * Call audio routing.
 *
 * On an iPhone the page can choose the call output in one of two ways,
 * depending on how new Safari is:
 *
 * - iOS 26 and newer Safari lists the phone's own outputs (earpiece, main
 *   speaker, and any headset), so the output is chosen by name. The audio
 *   session is deliberately left alone there: Safari's own default for a call
 *   is already the earpiece, and declaring the page as a call does not send the
 *   audio to the receiver on that version.
 * - Older iPhone Safari lists no outputs at all. There the Audio Session API is
 *   the only lever: declaring the page as 'play-and-record' (a call, rather than
 *   plain media) sends the call audio to the handset receiver. WebKit reads the
 *   microphone state when it applies that declaration, so it is applied again a
 *   moment later.
 *
 * Both are best-effort: where a browser offers neither, the phone decides.
 */

const EARPIECE = /earpiece|receiver|handset/i;
const SPEAKER = /speaker|loud/i;
const REASSERT_MS = 900;

let reassertTimer = null;

/** True on a phone or tablet, where call audio goes to a receiver or a speaker. */
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

const clearReassert = () => {
  if (reassertTimer) {
    clearTimeout(reassertTimer);
    reassertTimer = null;
  }
};

// Declaring 'auto' first makes WebKit treat the next value as a fresh route
// decision instead of skipping a value it already holds.
const applyHandsetRoute = () => {
  setSessionType("auto");
  setSessionType("play-and-record");
};

/** The outputs this browser offers for a call, empty where it offers none. */
const callOutputs = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audiooutput");
  } catch {
    return [];
  }
};

// Twilio's own id for the same output, so its audio elements can be pointed at it.
const twilioOutputId = (device, wanted) => {
  const available = device?.audio?.availableOutputDevices;
  if (!available || typeof available.forEach !== "function") return wanted.deviceId;
  let id = null;
  available.forEach((info, key) => {
    if (id !== null) return;
    if (info?.deviceId !== wanted.deviceId && info?.label !== wanted.label) return;
    id = typeof key === "string" ? key : info?.deviceId || null;
  });
  return id || wanted.deviceId;
};

const playThrough = async (device, output) => {
  if (!output) return false;
  try {
    await device.audio.speakerDevices.set(twilioOutputId(device, output));
    return true;
  } catch {
    return false;
  }
};

/** Put an active call on the handset route (earpiece). */
export const routeCallToEarpiece = async (device) => {
  clearReassert();
  const outputs = await callOutputs();

  if (outputs.length) {
    // This browser picks the output itself. A headset the user connected stays
    // their own choice; otherwise the call is aimed at the phone's receiver.
    const earpiece = outputs.find((output) => EARPIECE.test(output.label));
    const headset = outputs.some((output) => !EARPIECE.test(output.label) && !SPEAKER.test(output.label));
    if (earpiece && !headset) await playThrough(device, earpiece);
    return;
  }

  // No outputs to choose from: this is the older iPhone Safari case.
  applyHandsetRoute();
  reassertTimer = setTimeout(applyHandsetRoute, REASSERT_MS);
};

/** Put an active call on the loudspeaker. */
export const routeCallToSpeaker = async (device) => {
  clearReassert();
  const outputs = await callOutputs();
  const speaker = outputs.find((output) => SPEAKER.test(output.label) && !EARPIECE.test(output.label));
  if (speaker) await playThrough(device, speaker);
  setSessionType("auto");
};

/** Restore normal media routing once the call is over. */
export const releaseCallAudio = () => {
  clearReassert();
  setSessionType("playback");
  setSessionType("auto");
};