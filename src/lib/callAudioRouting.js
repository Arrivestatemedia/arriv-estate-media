// Output selection is a setSinkId capability, NOT an AudioSession capability.
// Safari 26 support: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#webrtc
const EARPIECE = /earpiece|receiver|handset/i;
const SPEAKER = /speaker|loud/i;
const SYSTEM_IDS = new Set(['default', 'communications', '']);

export const isPhoneDevice = typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const getCallOutputs = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(output => output.kind === 'audiooutput' && output.deviceId);
};

export const preferredCallOutput = (outputs) => {
  const physical = outputs.filter(output => !SYSTEM_IDS.has(output.deviceId));
  // A system-default alias is not evidence of a connected headset. Preserve
  // actual external devices instead of forcing a receiver over a user's headset.
  const external = physical.some(output => output.label
    && !EARPIECE.test(output.label) && !SPEAKER.test(output.label));
  return external ? null : physical.find(output => EARPIECE.test(output.label));
};

export const callOutputError = (error) => {
  if (error?.name === 'NotAllowedError') {
    return 'iOS needs a tap to change audio. Tap Audio, then choose the earpiece or speaker.';
  }
  if (error?.name === 'NotFoundError') {
    return 'That audio output is no longer connected. Tap Audio to choose another output.';
  }
  return `Audio was not switched: ${error?.message || 'the browser could not select that output.'}`;
};