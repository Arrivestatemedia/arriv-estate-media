// A persistent, DOM-attached WebAudio relay avoids Safari 26 ignoring sinkId
// on an element playing a raw WebRTC remote stream. No SDK private APIs.
// Background: https://github.com/livekit/client-sdk-js/pull/1635
export default function createCallAudioRelay() {
  const audio = document.createElement('audio');
  audio.hidden = true;
  audio.autoplay = true;
  audio.muted = true;
  audio.setAttribute('playsinline', '');
  document.body.appendChild(audio);
  const Context = window.AudioContext || window.webkitAudioContext;
  if (typeof audio.setSinkId !== 'function' || !Context) {
    audio.remove();
    return null;
  }
  const context = new Context();
  const destination = context.createMediaStreamDestination();
  audio.srcObject = destination.stream;
  const originals = new Map();
  let source = null;
  let stream = null;
  let selectedId = '';
  let disposed = false;

  const restore = () => {
    audio.muted = true;
    originals.forEach((muted, element) => { element.muted = muted; });
    selectedId = '';
  };
  return {
    get selectedId() { return selectedId; },
    get ready() { return !!source && originals.size > 0; },
    prime() {
      // Invoke both during the original Call/Accept tap, before any awaits.
      return Promise.all([context.resume(), audio.play()]);
    },
    addOriginal(element) {
      if (!originals.has(element)) originals.set(element, element.muted);
      if (selectedId) element.muted = true;
    },
    attachStream(remote) {
      if (!remote || remote === stream || disposed) return;
      if (source) source.disconnect();
      stream = remote;
      source = context.createMediaStreamSource(remote);
      source.connect(destination);
    },
    async select(id) {
      if (disposed || !source || !originals.size) {
        throw new Error('Call audio is not ready yet. Try again once connected.');
      }
      // Do not await enumeration or SDK device changes here: setSinkId must
      // begin in the output button's user gesture on the SAME relay element.
      const routing = audio.setSinkId(id);
      const resuming = context.resume();
      const playback = audio.play();
      await Promise.all([routing, resuming, playback]);
      if (disposed) return;
      if (audio.sinkId !== id) throw new Error('The browser did not accept that output.');
      // Keep the original call audible unless ALL relay operations succeed.
      originals.forEach((_, element) => { element.muted = true; });
      audio.muted = false;
      selectedId = id;
    },
    useSystem: restore,
    close() {
      if (disposed) return;
      disposed = true;
      restore();
      source?.disconnect();
      destination.disconnect();
      destination.stream.getTracks().forEach(track => track.stop());
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      originals.clear();
      context.close().catch(error => console.warn('[CallAudio] Cleanup:', error));
    },
  };
}