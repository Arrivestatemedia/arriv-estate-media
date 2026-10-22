import { useCallback, useEffect, useRef, useState } from 'react';
import createCallAudioRelay from '@/lib/callAudioRelay';
import { getCallOutputs, preferredCallOutput, callOutputError } from '@/lib/callAudioRouting';

const initial = { supported: false, outputs: [], selectedId: '', busy: false, error: '' };

export default function useCallAudioRouting(enabled) {
  const [state, setState] = useState(initial);
  const relayRef = useRef(null);
  const cleanupRef = useRef(null);
  const switchingRef = useRef(null);

  const release = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    relayRef.current?.close();
    relayRef.current = null;
    switchingRef.current = null;
    setState(initial);
  }, []);

  const report = useCallback((relay, error) => {
    if (relayRef.current !== relay) return;
    console.warn('[CallAudio]', error);
    setState(previous => ({ ...previous, error: callOutputError(error) }));
  }, []);

  const prepare = useCallback(() => {
    release();
    if (!enabled) return;
    try {
      const relay = createCallAudioRelay();
      relayRef.current = relay;
      setState({ ...initial, supported: !!relay });
      relay?.prime().catch(error => report(relay, error));
    } catch (error) {
      setState({ ...initial, error: callOutputError(error) });
    }
  }, [enabled, release, report]);

  const select = useCallback(async (id) => {
    const relay = relayRef.current;
    if (!relay || switchingRef.current) return false;
    switchingRef.current = relay;
    setState(previous => ({ ...previous, busy: true, error: '' }));
    try {
      // relay.select invokes setSinkId before its first await.
      await relay.select(id);
      if (relayRef.current !== relay) return false;
      setState(previous => ({ ...previous, selectedId: id, error: '' }));
      return true;
    } catch (error) {
      report(relay, error);
      return false;
    } finally {
      if (switchingRef.current === relay) switchingRef.current = null;
      if (relayRef.current === relay) setState(previous => ({ ...previous, busy: false }));
    }
  }, [report]);

  const attach = useCallback((call) => {
    const relay = relayRef.current;
    if (!relay) return;
    cleanupRef.current?.();
    let preferredAttempted = false;
    const refresh = async () => {
      const outputs = await getCallOutputs();
      if (relayRef.current !== relay) return [];
      if (relay.selectedId && !outputs.some(output => output.deviceId === relay.selectedId)) {
        relay.useSystem();
        setState(previous => ({ ...previous, selectedId: '', error: 'Audio output disconnected. Using system audio.' }));
      }
      setState(previous => ({ ...previous, outputs }));
      return outputs;
    };
    const ready = async (element) => {
      try {
        if (relayRef.current !== relay) return;
        if (element) relay.addOriginal(element);
        relay.attachStream(call.getRemoteStream());
        const outputs = await refresh();
        if (relayRef.current !== relay || preferredAttempted || !relay.ready || relay.selectedId) return;
        preferredAttempted = true;
        const preferred = preferredCallOutput(outputs);
        if (preferred) await select(preferred.deviceId);
      } catch (error) {
        report(relay, error);
      }
    };
    const onAudio = element => { void ready(element); };
    const onAccept = () => { void ready(); };
    const onDeviceChange = () => { refresh().catch(error => report(relay, error)); };
    call.on('audio', onAudio);
    call.on('accept', onAccept);
    call.on('disconnect', release);
    call.on('cancel', release);
    call.on('error', release);
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    cleanupRef.current = () => {
      call.removeListener('audio', onAudio);
      call.removeListener('accept', onAccept);
      call.removeListener('disconnect', release);
      call.removeListener('cancel', release);
      call.removeListener('error', release);
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    };
  }, [release, report, select]);

  useEffect(() => release, [release]);
  return { ...state, prepare, attach, release, select };
}