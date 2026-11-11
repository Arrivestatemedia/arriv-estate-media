import { useCallback, useEffect, useRef, useState } from "react";
import Daily from "@daily-co/daily-js";
import { runVideoConciergeTool } from "@/lib/conciergeClient";

/**
 * Joins the concierge's conversation room directly, so the concierge appears in our own
 * frame instead of inside the provider's hosted call page (which brings its own name
 * prompt, pre-join lobby, participant counter and picture-in-picture self view).
 *
 * The customer's camera is never opened: only audio goes out, so there is no self view
 * to speak of. If the room refuses a direct join, or she never appears, `onFail` lets
 * the caller fall back.
 */

/** Daily reports a track started with a MediaStreamTrack plus its type. */
function paintTrack(videoEl, audioEl, track, type, playAudio) {
  const raw = track?.persistentTrack || track;
  if (!raw) return false;
  const kind = type || raw.kind;
  const stream = new MediaStream([raw]);
  if (kind === "video" || kind === "screenVideo") {
    if (!videoEl) return false;
    videoEl.srcObject = stream;
    videoEl.play?.().catch(() => null);
    return true;
  }
  if (kind === "audio") {
    if (audioEl) {
      audioEl.srcObject = stream;
      playAudio();
    }
  }
  return false;
}

export default function useConciergeCall({ url, displayName, onFail, context, onDirective, onActivity }) {
  const callRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const failedRef = useRef(false);
  // Held in refs so a re-render (or the member moving to another screen) never re-runs the
  // join, while every tool call still carries the live portal context.
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const contextRef = useRef(context);
  contextRef.current = context;
  const onDirectiveRef = useRef(onDirective);
  onDirectiveRef.current = onDirective;
  // Any speech in the room is a working session, so the caller's quiet timer restarts on it.
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
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
    let sawVideo = false;

    const fail = () => {
      if (cancelled || failedRef.current) return;
      failedRef.current = true;
      setStatus("failed");
      onFailRef.current?.();
    };

    const attach = (track, type) => {
      const painted = paintTrack(videoRef.current, audioRef.current, track, type, playAudio);
      if (painted) sawVideo = true;
    };

    const call = Daily.createCallObject({
      audioSource: true,
      videoSource: false,
      subscribeToTracksAutomatically: true,
    });
    callRef.current = call;

    call.on("track-started", (event) => {
      // Her tracks only: the customer's own microphone is never painted anywhere.
      if (event?.participant?.local) return;
      attach(event?.track, event?.type);
    });

    call.on("track-stopped", (event) => {
      if (event?.participant?.local) return;
      const kind = event?.type || event?.track?.kind;
      if (kind === "video" || kind === "screenVideo") {
        if (videoRef.current) videoRef.current.srcObject = null;
        // She has left the room: show the waiting state rather than a black frame.
        if (!cancelled) setStatus("waiting");
      }
    });

    // Her app tools arrive here as conversation events. The portal runs the tool against
    // the real account and hands the result straight back to her, so she speaks from the
    // audited result rather than from anything the model assumed.
    const runToolCall = async (payload) => {
      if (!payload || payload.message_type !== "conversation" || payload.event_type !== "conversation.tool_call") return;
      const props = payload.properties || {};
      const toolCallId = props.tool_call_id;
      if (!toolCallId) return;

      let args = props.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args || "{}");
        } catch {
          args = {};
        }
      }

      let output = "That request could not be completed.";
      let status = "error";
      const result = await runVideoConciergeTool({
        toolName: props.name,
        args: args || {},
        conversationId: payload.conversation_id,
        context: contextRef.current || {},
      });
      if (result?.ok) {
        output = String(result.reply || "Done.").slice(0, 1500);
        status = "success";
      } else if (result?.reply) {
        output = String(result.reply).slice(0, 1500);
      }

      // The spoken instruction and a typed one drive the very same interface change: the
      // workspace opens beside her while she is still talking about it.
      if (result?.ui) {
        try {
          onDirectiveRef.current?.(result.ui);
        } catch {
          /* the interface change is cosmetic; the tool result still goes back to her */
        }
      }

      try {
        await call.sendAppMessage(
          {
            message_type: "conversation",
            event_type: "conversation.tool_result",
            conversation_id: payload.conversation_id,
            properties: { tool_call_id: toolCallId, output, status },
          },
          "*",
        );
      } catch {
        /* the call already ended; nothing left to answer */
      }
    };

    call.on("app-message", (event) => {
      onActivityRef.current?.();
      runToolCall(event?.data);
    });

    // Whoever is speaking — her or the member — the conversation is live.
    call.on("active-speaker-change", () => {
      onActivityRef.current?.();
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
        if (cancelled) return;
        // Anything already playable when we arrive is painted now, so a track that
        // started during the join is never missed.
        const participants = call.participants?.() || {};
        Object.values(participants).forEach((participant) => {
          if (participant?.local) return;
          Object.values(participant?.tracks || {}).forEach((entry) => {
            if (entry?.state !== "playable" || !entry?.track) return;
            attach(entry.track, entry.track.kind === "video" ? "video" : "audio");
          });
        });
        setStatus("live");
      })
      .catch(fail);

    // A room that never lets us in, or lets us in without her, must hand over to the
    // caller's fallback instead of leaving an empty frame on screen.
    const guard = setTimeout(() => {
      if (cancelled || failedRef.current) return;
      if (call.meetingState?.() !== "joined-meeting" || !sawVideo) fail();
    }, 20000);

    return () => {
      cancelled = true;
      clearTimeout(guard);
      try {
        call.leave();
      } catch {
        /* the frame is being torn down anyway */
      }
      try {
        call.destroy();
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