import { useCallback, useEffect, useRef, useState } from "react";
import Daily from "@daily-co/daily-js";

/**
 * Joins the concierge's conversation room directly, so the concierge appears in our own
 * frame instead of inside the provider's hosted call page (which brings its own name
 * prompt, pre-join lobby, participant counter and picture-in-picture self view).
 *
 * The customer's camera is never opened: only audio goes out, so there is no self view
 * to speak of. If the room refuses a direct join, `onFail` lets the caller fall back.
 */
export default function useConciergeCall({ url, displayName, onFail }) {
  const callRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const failedRef = useRef(false);
  // Held in a ref so a re-render never re-runs the join.
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const [status, setStatus] = useState("joining");
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  const playAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  }, []);

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    let call = null;

    const fail = () => {
      if (cancelled || failedRef.current) return;
      failedRef.current = true;
      setStatus("failed");
      onFailRef.current?.();
    };

    const attach = (track) => {
      if (!track?.persistentTrack) return;
      const stream = new MediaStream([track.persistentTrack]);
      if (track.type === "video" || track.type === "screenVideo") {
        const el = videoRef.current;
        if (el) el.srcObject = stream;
      } else if (track.type === "audio") {
        const el = audioRef.current;
        if (el) {
          el.srcObject = stream;
          playAudio();
        }
      }
    };

    try {
      call = Daily.createCallObject({
        audioSource: true,
        videoSource: false,
        subscribeToTracksAutomatically: true,
      });
    } catch {
      fail();
      return undefined;
    }
    callRef.current = call;

    call.on("track-started", (event) => {
      if (!event?.participant?.local) attach(event?.track);
    });
    call.on("track-stopped", (event) => {
      if (event?.participant?.local) return;
      if (event?.track?.type === "video" && videoRef.current) videoRef.current.srcObject = null;
    });
    call.on("error", fail);

    call
      .join({
        url,
        userName: displayName || "Preferred member",
        startVideoOff: true,
        startAudioOff: false,
      })
      .then(() => {
        if (!cancelled) setStatus("live");
      })
      .catch(fail);

    // A room that never lets us in must hand over to the caller's fallback.
    const guard = setTimeout(() => {
      if (!cancelled && callRef.current?.meetingState?.() !== "joined-meeting") fail();
    }, 20000);

    return () => {
      cancelled = true;
      clearTimeout(guard);
      try {
        call?.leave();
      } catch {
        /* the frame is being torn down anyway */
      }
      try {
        call?.destroy();
      } catch {
        /* nothing else to release */
      }
      callRef.current = null;
    };
  }, [url, displayName, playAudio]);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    const next = !muted;
    setMuted(next);
    try {
      call?.setLocalAudio(!next);
    } catch {
      /* the room is already closed */
    }
  }, [muted]);

  const leave = useCallback(() => {
    const call = callRef.current;
    try {
      call?.leave();
    } catch {
      /* already left */
    }
    setStatus("left");
  }, []);

  return { videoRef, audioRef, status, muted, needsTap, playAudio, toggleMute, leave };
}