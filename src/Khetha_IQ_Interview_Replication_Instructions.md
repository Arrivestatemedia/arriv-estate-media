# Khetha IQ — Interview System Replication Instructions (Aug 27-28 Changes)

Copy and paste the entire block below into the Khetha IQ builder chat. It covers every change made to the interview system on August 27 and August 28, so Khetha IQ gets the exact same fixes and features.

---

## COPY EVERYTHING BELOW THIS LINE

I need you to implement the following set of changes to our interview system. These are battle-tested fixes and features from our Estate Media app that need to be replicated here in Khetha IQ. Each section describes the file to create or modify, the exact behavior required, and the code to use.

### Overview

There are 8 changes total, all made on August 27-28:

1. **Stale Tavus conversation cleanup** — automatically end stale Tavus conversations before creating new ones (fixes the "Connection failed: 500" error caused by Tavus concurrent conversation limits)
2. **Tavus memory_stores for returning candidates** — pass the candidate's email as a stable memory store so the AI interviewer remembers the candidate across interviews
3. **Conference close button fix** — the X / hangup button must work even when the interview page was opened in a new browser tab (from an email link)
4. **Canvas compositing for AI interview recordings** — the Tavus AI interview recording must show BOTH the AI interviewer (full frame) AND the candidate (picture-in-picture)
5. **Canvas compositing for human interview recordings** — the Twilio human interview recording must show BOTH participants (remote full frame + local PIP)
6. **Recording cleanup on session end** — composite canvases, hidden video elements, and composite streams must be properly cleaned up when a call ends
7. **Tavus callback: PAL-initiated call end + S3 recording handling** — handle `system.shutdown` events and `application.recording_ready` with S3 storage URIs
8. **Interviews View: S3 recording playback + Convert AI/Human buttons** — the admin Interviews view must resolve `s3://` recording URIs to presigned URLs and show Convert-to-AI/Convert-to-Human buttons

---

### Change 1: Stale Tavus Conversation Cleanup

**File:** `base44/functions/createTavusInterviewConversation/entry.ts`

**Behavior:** When a candidate tries to join an AI interview, the function must first check if there's an existing Tavus conversation for this conference. If the conversation is still active, reuse it. If it's ended/stale, end it server-side to free up the concurrent conversation slot before creating a new one. This fixes the 500 error that happens when Tavus hits its concurrent conversation limit.

**Full file content:**

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createTavusConversation, getTavusConversation, endTavusConversation } from "../../shared/tavusInterview.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    // Find the conference by room_name
    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { room_name: roomName },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    if (conference.interview_mode !== "ai") {
      return Response.json({ error: "This interview is not configured for AI mode" }, { status: 403 });
    }

    // If we already have a conversation, check if it's still active
    if (conference.tavus_conversation_id) {
      try {
        const existing = await getTavusConversation(conference.tavus_conversation_id);
        if (existing && existing.status !== "ended" && existing.conversation_url) {
          return Response.json({
            status: "success",
            conversationId: existing.conversation_id || conference.tavus_conversation_id,
            conversationUrl: existing.conversation_url,
            meetingToken: conference.tavus_meeting_token || existing.meeting_token,
            reused: true,
          });
        }
        // Conversation exists but is ended/stale — end it server-side to free
        // up the concurrent conversation slot before creating a new one.
        try {
          await endTavusConversation(conference.tavus_conversation_id);
        } catch (_) {}
      } catch (e) {
        console.warn("Failed to check existing conversation, creating new:", e.message);
      }
    }

    // Create a new Tavus conversation.
    // Pass the candidate's email as a stable memory store so the PAL (Ashley)
    // can remember the candidate across interviews and welcome them back.
    const candidateEmail = conference.participants?.[0]?.email || "";
    const memoryStore = candidateEmail
      ? `arriv-candidate-${candidateEmail.toLowerCase().trim()}`
      : undefined;
    const conversationName = `Arriv Interview - ${conference.title || roomName}`;
    const tavusRes = await createTavusConversation({
      conversationName,
      requireAuth: true,
      maxParticipants: 2,
      memoryStore,
    });

    const conversationId = tavusRes.conversation_id;
    const conversationUrl = tavusRes.conversation_url;
    const meetingToken = tavusRes.meeting_token;

    if (!conversationUrl) {
      throw new Error("Tavus did not return a conversation_url");
    }

    // Persist conversation details on the conference
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      tavus_conversation_id: conversationId,
      tavus_conversation_status: "active",
      tavus_started_at: new Date().toISOString(),
      tavus_meeting_token: meetingToken || null,
    });

    return Response.json({
      status: "success",
      conversationId,
      conversationUrl,
      meetingToken,
      reused: false,
    });
  } catch (error) {
    console.error("createTavusInterviewConversation error:", error.message);
    return Response.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
});
```

---

### Change 2: Tavus Shared Module — Add `memoryStore` Parameter

**File:** `base44/shared/tavusInterview.ts`

**Behavior:** The `createTavusConversation` function needs a new optional `memoryStore` parameter. When provided, it's passed as `memory_stores` in the Tavus API request body. Per Tavus docs, `memory_stores` should be a stable, unique identifier for the user (e.g. user email). This lets the PAL remember the candidate across conversations.

**Find the `createTavusConversation` function and replace it with:**

```typescript
/** Create a new Tavus CVI conversation. */
export async function createTavusConversation(opts: {
  palId?: string;
  conversationName: string;
  requireAuth?: boolean;
  maxParticipants?: number;
  /**
   * Stable per-user identifier (e.g. candidate email) passed as a Tavus
   * memory store. This lets the PAL (Ashley) remember the candidate across
   * multiple conversations and proactively welcome them back. Per Tavus docs,
   * memory_stores should be a stable, unique identifier for the user.
   */
  memoryStore?: string;
}) {
  const body: Record<string, any> = {
    pal_id: opts.palId || TAVUS_PAL_ID,
    conversation_name: opts.conversationName,
    callback_url: getCallbackUrl(),
    require_auth: opts.requireAuth !== false,
    max_participants: opts.maxParticipants || 2,
  };

  // Pass a stable per-candidate memory store so Ashley (the PAL) can recall
  // details from prior interviews and welcome returning candidates by name.
  if (opts.memoryStore) {
    body.memory_stores = [opts.memoryStore];
  }

  // Enable Tavus server-side recording when S3 storage is configured.
  const recordingProps = buildRecordingProperties();
  if (recordingProps) {
    body.properties = recordingProps;
  }

  const res = await fetch(`${TAVUS_API_BASE}/conversations`, {
    method: "POST",
    headers: tavusHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = JSON.stringify(data);
    throw new Error(`${data?.message || data?.error || "Tavus create failed"} | FULL RESPONSE: ${detail}`);
  }
  return data;
}
```

---

### Change 3: Conference Close Button Fix

**File:** `src/pages/Conference.jsx`

**Behavior:** The close/hangup button must work even when the interview page was opened in a new browser tab (e.g. from an interview invitation email). `window.history.back()` silently does nothing when there's no history (new tab), which made the X button appear broken. The fix: if there's browser history, go back; otherwise redirect to the app home.

**Find or create the `Conference` page component and ensure it has this close handler, passed as `onClose` to both `TavusInterviewPanel` and `VideoCallPanelV2`:**

```jsx
// Close the interview: go back if there's history, otherwise redirect
// to the app home. window.history.back() silently does nothing when the
// page was opened in a new tab (e.g. from an interview email link),
// which left the X button appearing broken.
const handleClose = () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
};
```

**The Conference page should also:**
1. Read `room` from URL params (`?room=...`)
2. Check the conference's `interview_mode` — if `"ai"`, render `TavusInterviewPanel`; otherwise render `VideoCallPanelV2`
3. For human interviews, call `ensureTwilioRecordingRoom` BEFORE setting `autoStart` so the Twilio room with server-side recording exists before anyone joins
4. Pass `onClose={handleClose}` to whichever panel is rendered

---

### Change 4: Canvas Compositing for AI Interview Recordings (TavusInterviewPanel)

**File:** `src/components/interviews/TavusInterviewPanel.jsx`

**Behavior:** The AI interview recording must show BOTH the AI interviewer (full frame) AND the candidate (picture-in-picture overlay). Previously, only the AI's video was captured. The fix uses a composite canvas that draws the remote (AI) video full-frame with a cover-fit, then draws the local (candidate) video as a PIP in the bottom-right corner with a rounded border. The canvas stream (video) + mixed audio (remote + local) is what gets recorded.

**This is a full component rewrite. Key implementation details:**

#### 4a. Refs needed (add at top of component):
```jsx
const localVideoRef = useRef(null);
const remoteVideoRef = useRef(null);
const localStreamRef = useRef(null);
const callRef = useRef(null);

// Recording refs
const mediaRecorderRef = useRef(null);
const recordingStartTimeRef = useRef(0);
const audioContextRef = useRef(null);
const recordingTimerRef = useRef(null);
const recordingStartedRef = useRef(false);

// Composite canvas refs — blend AI interviewer (full frame) + candidate (PIP)
const compositeCanvasRef = useRef(null);
const compositeStreamRef = useRef(null);
const drawLoopRef = useRef(null);
const recRemoteVideoRef = useRef(null);
const recLocalVideoRef = useRef(null);

// Chunked recording: segments upload during the call so partial recordings
// survive a call drop. 3 minutes per segment.
const SEGMENT_DURATION_MS = 3 * 60 * 1000;
const segmentNumberRef = useRef(0);
const segmentUrlsRef = useRef([]);
const segmentTimeoutRef = useRef(null);
const recordingTracksRef = useRef(null);
const isEndingRef = useRef(false);

// Promise that resolves when the final segment upload finishes — handleEndCall
// awaits this so the page doesn't unload mid-upload.
const finalUploadPromiseRef = useRef(Promise.resolve());
const stopResolveRef = useRef(null);

// Ref mirror of callState so Daily event listeners never read a stale closure
const callStateRef = useRef("idle");
const updateCallState = useCallback((next) => {
  callStateRef.current = next;
  setCallState(next);
}, []);
```

#### 4b. The `startRecording` function (called automatically when remote video arrives):
```jsx
const startRecording = useCallback((remoteVideoTrack, remoteAudioTrack) => {
  // Build a composite canvas: AI interviewer full-frame + candidate PIP.
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  compositeCanvasRef.current = canvas;

  // Hidden video elements for drawing to canvas
  const remoteEl = document.createElement("video");
  remoteEl.autoplay = true;
  remoteEl.playsInline = true;
  remoteEl.muted = true;
  remoteEl.srcObject = new MediaStream([remoteVideoTrack]);
  recRemoteVideoRef.current = remoteEl;

  const localEl = document.createElement("video");
  localEl.autoplay = true;
  localEl.playsInline = true;
  localEl.muted = true;
  if (localStreamRef.current) {
    localEl.srcObject = localStreamRef.current;
  }
  recLocalVideoRef.current = localEl;

  // PIP dimensions (bottom-right, ~22% width)
  const pipW = 280;
  const pipH = 210;
  const pipX = canvas.width - pipW - 24;
  const pipY = canvas.height - pipH - 24;

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Main: remote (AI interviewer) full-frame, cover-fit
    const rv = recRemoteVideoRef.current;
    if (rv && rv.videoWidth > 0) {
      const vw = rv.videoWidth, vh = rv.videoHeight;
      const scale = Math.max(canvas.width / vw, canvas.height / vh);
      const dw = vw * scale, dh = vh * scale;
      const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;
      ctx.drawImage(rv, dx, dy, dw, dh);
    }

    // PIP: local (candidate) with border
    const lv = recLocalVideoRef.current;
    if (lv && lv.videoWidth > 0) {
      const vw = lv.videoWidth, vh = lv.videoHeight;
      const scale = Math.max(pipW / vw, pipH / vh);
      const dw = vw * scale, dh = vh * scale;
      const dx = pipX + (pipW - dw) / 2, dy = pipY + (pipH - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 8);
      ctx.clip();
      ctx.drawImage(lv, dx, dy, dw, dh);
      ctx.restore();
      ctx.strokeStyle = "rgba(184,149,106,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 8);
      ctx.stroke();
    }

    drawLoopRef.current = requestAnimationFrame(draw);
  };
  draw();

  const canvasStream = canvas.captureStream(30);
  compositeStreamRef.current = canvasStream;
  const tracks = [canvasStream.getVideoTracks()[0]];

  // Mix remote + local audio
  const audioTracks = [];
  if (remoteAudioTrack) audioTracks.push(remoteAudioTrack);
  const localAudio = localStreamRef.current?.getAudioTracks()[0];
  if (localAudio) audioTracks.push(localAudio);

  if (audioTracks.length > 0) {
    try {
      const actx = new AudioContext();
      audioContextRef.current = actx;
      const destination = actx.createMediaStreamDestination();
      for (const t of audioTracks) {
        try { actx.createMediaStreamSource(new MediaStream([t])).connect(destination); } catch (_) {}
      }
      const mixed = destination.stream.getAudioTracks()[0];
      if (mixed) tracks.push(mixed);
    } catch (_) {}
  }

  if (tracks.length === 0) { console.warn("No media tracks to record"); return; }

  recordingTracksRef.current = tracks;
  isEndingRef.current = false;
  segmentUrlsRef.current = [];
  recordingStartTimeRef.current = Date.now();
  setIsRecording(true);
  setRecordingTime(0);
  recordingTimerRef.current = setInterval(() => {
    setRecordingTime(Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
  }, 1000);

  startSegment(1);
}, [startSegment]);
```

#### 4c. The `stopRecording` function (cleans up composite canvas + creates upload promise):
```jsx
const stopRecording = useCallback(() => {
  isEndingRef.current = true;
  if (segmentTimeoutRef.current) { clearTimeout(segmentTimeoutRef.current); segmentTimeoutRef.current = null; }
  if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  if (drawLoopRef.current) { cancelAnimationFrame(drawLoopRef.current); drawLoopRef.current = null; }
  // Stop hidden recording video elements
  for (const ref of [recRemoteVideoRef, recLocalVideoRef]) {
    if (ref.current) {
      try { ref.current.srcObject = null; ref.current.remove(); } catch (_) {}
      ref.current = null;
    }
  }
  if (compositeStreamRef.current) {
    compositeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
    compositeStreamRef.current = null;
  }
  compositeCanvasRef.current = null;
  if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
    // Create a promise that resolves when onstop finishes the upload.
    // handleEndCall awaits this so the page doesn't unload mid-upload.
    finalUploadPromiseRef.current = new Promise((resolve) => {
      stopResolveRef.current = resolve;
    });
    try { mediaRecorderRef.current.stop(); } catch (_) {}
  }
  setIsRecording(false);
  setRecordingTime(0);
  if (audioContextRef.current) {
    try { audioContextRef.current.close(); } catch (_) {}
    audioContextRef.current = null;
  }
}, []);
```

#### 4d. The Daily `left-meeting` event handler (handles unexpected disconnects):
```jsx
call.on("left-meeting", () => {
  // The meeting ended — either the user left, Tavus ended the conversation,
  // or a network drop disconnected us. If we were connected, treat this as
  // an unexpected end: stop the recording (flushes + uploads final segment),
  // clean up the call object, and show an ended state. Do NOT silently reset
  // to idle (that would show a confusing "Join Call" button and leave the
  // recorder running in the background).
  if (callStateRef.current === "connected") {
    stopRecording();
    if (callRef.current) {
      try { callRef.current.destroy(); } catch (_) {}
      callRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    recordingStartedRef.current = false;
    // End the Tavus conversation server-side so it doesn't linger
    base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
    updateCallState("ended");
  } else {
    updateCallState("idle");
  }
});
```

#### 4e. `handleEndCall` waits for the final upload before closing:
```jsx
const handleEndCall = useCallback(async () => {
  // Stop recording first (triggers upload in onstop handler)
  stopRecording();
  // Wait for the final segment upload to finish before closing — otherwise
  // onClose() unloads the page and the browser cancels the in-flight upload,
  // so no recording is ever saved.
  setIsSavingRecording(true);
  try { await finalUploadPromiseRef.current; } catch (_) {}
  setIsSavingRecording(false);
  if (callRef.current) {
    try { callRef.current.leave(); } catch (_) {}
    try { callRef.current.destroy(); } catch (_) {}
    callRef.current = null;
  }
  localStreamRef.current?.getTracks().forEach(t => t.stop());
  localStreamRef.current = null;
  if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  if (localVideoRef.current) localVideoRef.current.srcObject = null;
  recordingStartedRef.current = false;
  // End the Tavus conversation server-side
  base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
  onClose();
}, [onClose, roomName, stopRecording]);
```

#### 4f. UI overlays needed (rendered inside the video area):

1. **Pre-call recording notice** (shown when `callState === "idle"` and not dismissed):
   - Red icon, "This interview will be recorded", consent text, "I Understand — Continue" button
   - Must be dismissed before the "Join Call" button appears

2. **Join Call button** (centered, shown when `callState === "idle"` and notice dismissed):
   - Green button with phone icon, "Join Call"

3. **Recording indicator** (always visible during call when recording):
   - Red pulsing "● REC" with live timer: `REC {formatTime(recordingTime)}`
   - Top-left corner

4. **Call-ended overlay** (shown when `callState === "ended"` and not saving):
   - Phone icon, "Call Ended", "The interview connection has ended. Your recording has been saved."
   - "Close" button that calls `handleEndCall`

5. **Saving recording overlay** (shown when `isSavingRecording` is true):
   - Spinner, "Saving recording…", "Please wait while your interview recording is uploaded. Closing now will lose the recording."

6. **Local video PIP** (bottom-right, mirrored, with "You" label)

7. **Connected badge** (shown when connected but recording hasn't started yet):
   - Green "✓ Connected" badge, top-left

---

### Change 5: Canvas Compositing for Human Interview Recordings (VideoCallPanelV2)

**File:** `src/components/sales/VideoCallPanelV2.jsx`

**Behavior:** The human interview recording (Twilio) must also show BOTH participants — the remote participant (interviewee) full-frame with the local participant (interviewer) as a PIP overlay.

#### 5a. Refs needed:
```jsx
const compositeCanvasRef = useRef(null);
const compositeStreamRef = useRef(null);
const drawLoopRef = useRef(null);
const recRemoteVideoRef = useRef(null);
const recLocalVideoRef = useRef(null);
const remoteVideoTrackRef = useRef(null);
const remoteAudioTrackRef = useRef(null);
const audioContextRef = useRef(null);
```

#### 5b. In `toggleRecording` (start path), build the composite canvas:
```jsx
// Build a composite canvas: remote (interviewee) full-frame + local PIP.
const canvas = document.createElement("canvas");
canvas.width = 1280;
canvas.height = 720;
const cctx = canvas.getContext("2d");
compositeCanvasRef.current = canvas;

const remoteEl = document.createElement("video");
remoteEl.autoplay = true; remoteEl.playsInline = true; remoteEl.muted = true;
if (remoteVideoTrackRef.current) remoteEl.srcObject = new MediaStream([remoteVideoTrackRef.current]);
recRemoteVideoRef.current = remoteEl;

const localEl = document.createElement("video");
localEl.autoplay = true; localEl.playsInline = true; localEl.muted = true;
if (localStreamRef.current) localEl.srcObject = localStreamRef.current;
recLocalVideoRef.current = localEl;

const pipW = 280, pipH = 210;
const pipX = canvas.width - pipW - 24;
const pipY = canvas.height - pipH - 24;

const draw = () => {
  cctx.fillStyle = "#000";
  cctx.fillRect(0, 0, canvas.width, canvas.height);
  const rv = recRemoteVideoRef.current;
  if (rv && rv.videoWidth > 0) {
    const vw = rv.videoWidth, vh = rv.videoHeight;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    cctx.drawImage(rv, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  const lv = recLocalVideoRef.current;
  if (lv && lv.videoWidth > 0) {
    const vw = lv.videoWidth, vh = lv.videoHeight;
    const scale = Math.max(pipW / vw, pipH / vh);
    const dw = vw * scale, dh = vh * scale;
    cctx.save();
    cctx.beginPath(); cctx.roundRect(pipX, pipY, pipW, pipH, 8); cctx.clip();
    cctx.drawImage(lv, pipX + (pipW - dw) / 2, pipY + (pipH - dh) / 2, dw, dh);
    cctx.restore();
    cctx.strokeStyle = "rgba(184,149,106,0.9)"; cctx.lineWidth = 3;
    cctx.beginPath(); cctx.roundRect(pipX, pipY, pipW, pipH, 8); cctx.stroke();
  }
  drawLoopRef.current = requestAnimationFrame(draw);
};
draw();

const canvasStream = canvas.captureStream(30);
compositeStreamRef.current = canvasStream;
const tracks = [canvasStream.getVideoTracks()[0]];

// Mix remote + local audio
const audioTracks = [];
if (remoteAudioTrackRef.current) audioTracks.push(remoteAudioTrackRef.current);
const localAudio = localStreamRef.current?.getAudioTracks()[0];
if (localAudio) audioTracks.push(localAudio);

if (audioTracks.length > 0) {
  try {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const destination = ctx.createMediaStreamDestination();
    for (const t of audioTracks) {
      try { ctx.createMediaStreamSource(new MediaStream([t])).connect(destination); } catch (_) {}
    }
    const mixed = destination.stream.getAudioTracks()[0];
    if (mixed) tracks.push(mixed);
  } catch (_) {}
}
```

#### 5c. In `recorder.onstop`, clean up the composite canvas and hidden videos:
```jsx
if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
if (drawLoopRef.current) { cancelAnimationFrame(drawLoopRef.current); drawLoopRef.current = null; }
for (const ref of [recRemoteVideoRef, recLocalVideoRef]) {
  if (ref.current) { try { ref.current.srcObject = null; ref.current.remove(); } catch (_) {} ref.current = null; }
}
if (compositeStreamRef.current) { compositeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); compositeStreamRef.current = null; }
compositeCanvasRef.current = null;
```

#### 5d. In `handleEndCall`, clean up the same composite resources:
```jsx
if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
  try { mediaRecorderRef.current.stop(); } catch (_) {}
}
if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
if (drawLoopRef.current) { cancelAnimationFrame(drawLoopRef.current); drawLoopRef.current = null; }
for (const ref of [recRemoteVideoRef, recLocalVideoRef]) {
  if (ref.current) { try { ref.current.srcObject = null; ref.current.remove(); } catch (_) {} ref.current = null; }
}
if (compositeStreamRef.current) { compositeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); compositeStreamRef.current = null; }
compositeCanvasRef.current = null;
```

#### 5e. Store remote tracks when they arrive (so compositing can access them):
```jsx
// When subscribing to a remote participant's tracks:
remoteVideoTrackRef.current = videoTrack;
remoteAudioTrackRef.current = audioTrack;
```

---

### Change 6: Tavus Callback — PAL-Initiated Call End + S3 Recording Handling

**File:** `base44/functions/tavusInterviewCallback/entry.ts`

**Behavior:** The Tavus PAL (Ashley) can end calls herself when the interview wraps up. The callback must handle `system.shutdown` and `system.conversation_ended` events to mark the conference as completed. It must also handle `application.recording_ready` to save the S3 storage URI, create a `VideoRecording` entity, and sync the recording to the linked `HireCandidate`'s documents.

**Full file content:**

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseTranscriptToScorecard } from "../../shared/tavusInterview.ts";

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    console.log("Tavus callback received:", JSON.stringify(body, null, 2));

    const eventType = body.event_type || body.message_type || "";
    const conversationId = body.conversation_id || body.properties?.conversation_id || "";

    if (!conversationId) {
      return Response.json({ status: "ignored", reason: "no conversation_id" });
    }

    const base44 = createClientFromRequest(req);

    // Find the conference by tavus_conversation_id
    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { tavus_conversation_id: conversationId },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      console.warn("No conference found for conversation", conversationId);
      return Response.json({ status: "ignored", reason: "no conference" });
    }

    // ─── Handle different event types ───────────────────────────────────────

    // PAL joined the conversation
    if (eventType === "system.pal_joined" || eventType === "system.replica_joined") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "active",
      });
      return Response.json({ status: "success", action: "pal_joined" });
    }

    // PAL ended the conversation (Ashley can end calls herself)
    if (eventType === "system.shutdown" || eventType === "system.conversation_ended") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "ended",
        tavus_completed_at: new Date().toISOString(),
        status: "completed",
      });
      return Response.json({ status: "success", action: "ended" });
    }

    // Tavus server-side recording is ready — durably written to our S3 bucket
    if (eventType === "application.recording_ready") {
      const props = body.properties || {};
      const s3Key = props.s3_key || "";
      const storageUri = props.storage_uri || (props.bucket_name && s3Key ? `s3://${props.bucket_name}/${s3Key}` : null);
      const duration = props.duration || 0;

      // Save the permanent S3 URI on the conference
      try {
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_recording_storage_uri: storageUri || null,
          recording_status: "ready",
          recording_duration_seconds: duration || conference.recording_duration_seconds || null,
          recording_url: storageUri || conference.recording_url || null,
        });
      } catch (e) {
        console.warn("Failed to save Tavus recording storage URI:", e.message);
      }

      // Create a VideoRecording entity (avoid duplicates for same room)
      if (storageUri) {
        try {
          const existingRecs = await base44.asServiceRole.entities.VideoRecording.filter(
            { room_name: conference.room_name },
            "-created_date",
            10
          );
          const recs = existingRecs?.data ?? existingRecs ?? [];
          const exists = Array.isArray(recs) && recs.some(r => (r.file_url || "").startsWith("s3://"));
          if (!exists) {
            const participant = conference.participants?.[0];
            await base44.asServiceRole.entities.VideoRecording.create({
              file_url: storageUri,
              duration_seconds: duration,
              file_size: 0,
              room_name: conference.room_name || null,
              recorded_by_name: "Tavus AI Interviewer",
              participant_name: participant?.name || conference.title || null,
            });
          }
        } catch (e) {
          console.warn("Failed to create VideoRecording for Tavus recording:", e.message);
        }
      }

      // Sync recording to the linked HireCandidate's documents
      const participant = conference.participants?.[0];
      if (storageUri && participant?.email) {
        try {
          const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
            { email: participant.email },
            "-created_date",
            5
          );
          const candidates = candRes?.data ?? candRes ?? [];
          const candidate = Array.isArray(candidates) ? candidates[0] : null;
          if (candidate) {
            const existingDocs = Array.isArray(candidate.documents) ? candidate.documents : [];
            const alreadyHas = existingDocs.some(d => d?.url === storageUri);
            if (!alreadyHas) {
              const durLabel = duration ? ` (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")})` : "";
              existingDocs.push({
                type: "interview_recording",
                url: storageUri,
                storage_type: "s3",
                label: `AI Interview Recording${durLabel}`,
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
              await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                documents: existingDocs,
              });
            }
          }
        } catch (e) {
          console.warn("Failed to sync Tavus recording to HireCandidate:", e.message);
        }
      }

      return Response.json({ status: "success", action: "recording_ready", storage_uri: storageUri });
    }

    if (eventType === "application.recording_copy_failed") {
      console.warn("Tavus recording copy failed:", body.properties?.error_message);
      return Response.json({ status: "success", action: "recording_copy_failed" });
    }

    // Transcript ready — parse to scorecard
    if (eventType === "application.transcription_ready" || eventType === "application.transcription") {
      const transcript = body.transcript || body.properties?.transcript || body.data?.transcript || [];

      // Normalize transcript entries
      const normalized = Array.isArray(transcript)
        ? transcript.map((t: any, i: number) => ({
            role: t.role || t.speaker || "user",
            content: t.content || t.text || t.message || "",
            timestamp: t.timestamp || t.time || null,
            seconds_from_start: t.seconds_from_start ?? t.secondsFromStart ?? null,
            duration: t.duration ?? null,
          }))
        : [];

      const participant = conference.participants?.[0];
      const candidateName = participant?.name || conference.title || "";

      // Parse transcript to scorecard
      let parsed = { scorecard: null, confidence: 0, review_required: true, all_answered: false };
      try {
        parsed = await parseTranscriptToScorecard(base44, normalized, candidateName);
      } catch (e) {
        console.error("Transcript parsing failed:", e.message);
      }

      // Store the transcript
      try {
        await base44.asServiceRole.entities.TavusInterviewTranscript.create({
          conference_id: conference.id,
          conversation_id: conversationId,
          application_id: participant?.id || null,
          candidate_id: null,
          candidate_name: candidateName,
          transcript: normalized,
          raw_payload: body,
          event_type: eventType,
          status: "completed",
          parsed_scorecard: parsed.scorecard,
          parsing_confidence: parsed.confidence,
          review_required: parsed.review_required,
          scorecard_saved: false,
          received_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to store transcript:", e.message);
      }

      // Save scorecard to conference if parsing succeeded
      if (parsed.scorecard && !parsed.review_required) {
        try {
          await base44.asServiceRole.entities.Conference.update(conference.id, {
            round1_scorecard: parsed.scorecard,
            scorecard_completed_at: new Date().toISOString(),
            tavus_scorecard_saved: true,
            tavus_review_required: false,
          });

          // If linked to a HireCandidate, also save there
          if (participant?.id) {
            try {
              const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
                { email: participant.email },
                "-created_date",
                5
              );
              const candidates = candRes?.data ?? candRes ?? [];
              const candidate = Array.isArray(candidates) ? candidates[0] : null;
              if (candidate) {
                await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                  round1_scorecard: parsed.scorecard,
                  status: "interviewing",
                });
              }
            } catch (e) {
              console.warn("Failed to update HireCandidate:", e.message);
            }
          }
        } catch (e) {
          console.error("Failed to save scorecard:", e.message);
        }
      } else if (parsed.review_required) {
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_review_required: true,
        });
      }

      return Response.json({ status: "success", action: "transcript_stored", review_required: parsed.review_required });
    }

    // Unhandled event type — acknowledge to prevent Tavus retries
    return Response.json({ status: "success", action: "unhandled_event", event_type: eventType });
  } catch (error) {
    console.error("tavusInterviewCallback error:", error.message);
    return Response.json({ status: "error", error: error.message }, { status: 500 });
  }
});
```

---

### Change 7: saveInterviewRecording — Segment Support + Twilio Backup Promotion

**File:** `base44/functions/saveInterviewRecording/entry.ts`

**Behavior:** This function handles three scenarios:
1. **Recording started** — marks the conference `recording_status` as `"recording"` so the Twilio webhook knows to wait for the local upload
2. **Recording failed** — marks `recording_status` as `"failed"` and promotes the Twilio composition to primary if it already arrived
3. **Recording succeeded** — saves the recording URL, creates a `VideoRecording` entity, and syncs to the linked `HireCandidate`'s documents. Supports multi-segment recordings (first segment is primary, subsequent segments are appended as additional parts).

**Full file content:**

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName, recordingUrl, durationSeconds, fileSize, recordingStarted, failed, segment } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    // Find the conference by room_name
    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { room_name: roomName },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    const participant = conference.participants?.[0];

    // ─── Recording STARTED: mark status so Twilio webhook knows to wait ──
    if (recordingStarted) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "recording",
      });
      return Response.json({ status: "success", action: "recording_started" });
    }

    // ─── Recording FAILED: promote Twilio to primary if available ────────
    if (failed) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "failed",
      });

      if (conference.twilio_composition_url && participant?.email) {
        try {
          const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
            { email: participant.email },
            "-created_date",
            5
          );
          const candidates = candRes?.data ?? candRes ?? [];
          const candidate = Array.isArray(candidates) ? candidates[0] : null;
          if (candidate) {
            const existingDocs = Array.isArray(candidate.documents) ? candidate.documents : [];
            const alreadyHas = existingDocs.some(
              d => d?.url === conference.twilio_composition_url ||
                   d?.composition_sid === conference.twilio_composition_sid
            );
            if (!alreadyHas) {
              existingDocs.push({
                type: "interview_recording",
                url: conference.twilio_composition_url,
                composition_sid: conference.twilio_composition_sid,
                label: "Interview Recording",
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
              await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                documents: existingDocs,
              });
            }
          }
        } catch (e) {
          console.warn("Failed to promote Twilio after local failure:", e.message);
        }
      }
      return Response.json({ status: "success", action: "recording_failed" });
    }

    // ─── Recording SUCCEEDED: save local + add Twilio as backup ──────────
    if (!recordingUrl) {
      return Response.json({ error: "recordingUrl is required" }, { status: 400 });
    }

    // First segment becomes the primary; subsequent segments don't overwrite
    const segNum = typeof segment === "number" ? segment : 1;
    if (segNum === 1) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_url: recordingUrl,
        recording_status: "ready",
        recording_duration_seconds: durationSeconds || null,
      });
    } else {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "ready",
        recording_duration_seconds: durationSeconds || null,
      });
    }

    // Create a VideoRecording record (only if one doesn't already exist for this URL)
    try {
      const existingRecs = await base44.asServiceRole.entities.VideoRecording.filter(
        { file_url: recordingUrl },
        "-created_date",
        1
      );
      const recs = existingRecs?.data ?? existingRecs ?? [];
      if (!Array.isArray(recs) || recs.length === 0) {
        await base44.asServiceRole.entities.VideoRecording.create({
          file_url: recordingUrl,
          duration_seconds: durationSeconds || 0,
          file_size: fileSize || 0,
          recorded_by_id: conference.organizer_id || null,
          recorded_by_name: conference.organizer_name || "AI Interviewer",
          participant_name: participant?.name || conference.title || "",
          room_name: roomName,
        });
      }
    } catch (e) {
      console.warn("Failed to create VideoRecording:", e.message);
    }

    // If linked to a HireCandidate, add local as primary + Twilio as backup
    if (participant?.email) {
      try {
        const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
          { email: participant.email },
          "-created_date",
          5
        );
        const candidates = candRes?.data ?? candRes ?? [];
        const candidate = Array.isArray(candidates) ? candidates[0] : null;
        if (candidate) {
          const existingDocs = Array.isArray(candidate.documents) ? candidate.documents : [];
          const newDocs = [];

          const alreadyHasLocal = existingDocs.some(d => d?.url === recordingUrl);
          if (!alreadyHasLocal) {
            const partLabel = segNum > 1 ? ` (Part ${segNum})` : "";
            newDocs.push({
              type: "interview_recording",
              url: recordingUrl,
              label: `Interview Recording${partLabel}${durationSeconds ? ` (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")})` : ""}`,
              conference_id: conference.id,
              created_at: new Date().toISOString(),
            });
          }

          // If Twilio composition already arrived, add it as backup
          if (conference.twilio_composition_url) {
            const alreadyHasTwilio = existingDocs.some(
              d => d?.url === conference.twilio_composition_url ||
                   d?.composition_sid === conference.twilio_composition_sid
            );
            if (!alreadyHasTwilio) {
              newDocs.push({
                type: "twilio_backup_recording",
                url: conference.twilio_composition_url,
                composition_sid: conference.twilio_composition_sid,
                label: "Backup Recording",
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
            }
          }

          if (newDocs.length > 0) {
            await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
              documents: [...existingDocs, ...newDocs],
            });
          }
        }
      } catch (e) {
        console.warn("Failed to update HireCandidate with recording:", e.message);
      }
    }

    return Response.json({ status: "success", conferenceId: conference.id });
  } catch (error) {
    console.error("saveInterviewRecording error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```

---

### Change 8: Interviews View — S3 Recording Playback + Convert AI/Human Buttons

**File:** `src/components/khethaiq/KhethaIQViews.jsx` (or equivalent Interviews view component)

**Behavior:** The admin Interviews view must:
1. Load conferences, interviews, candidates, and video recordings in parallel
2. Hide interviews belonging to archived/declined candidates
3. Build a `room_name → recording` map from `VideoRecording` entities (recordings live in `VideoRecording`, not on the conference)
4. For each conference, show: applicant name, date/time, join link, Convert-to-AI button, Convert-to-Human button, Recording button (if a recording exists), Questionnaire button, Disqualify button, status badge
5. The Recording button must detect `s3://` URLs and call `getTavusRecordingUrl` to get a fresh presigned playback URL before opening it

**Key implementation for S3 recording playback:**

```jsx
const handlePlayRecording = async (recording) => {
  const fileUrl = recording?.file_url || "";
  // S3 recordings (Tavus server-side) need a fresh presigned URL
  if (fileUrl.startsWith("s3://")) {
    setLoadingRecRoom(recording.room_name || fileUrl);
    try {
      const res = await base44.functions.invoke("getTavusRecordingUrl", { storageUri: fileUrl });
      const url = res?.url || res?.data?.url;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast({ variant: "destructive", title: "Recording unavailable", description: "Could not generate a playback URL." });
    } catch (err) {
      toast({ variant: "destructive", title: "Recording unavailable", description: err.message || "Unknown error" });
    } finally {
      setLoadingRecRoom(null);
    }
  } else {
    // Regular URL — open directly
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  }
};
```

**The Interviews view load function:**
```jsx
const loadInterviews = async () => {
  try {
    const [ivRes, confRes, candRes, recRes] = await Promise.all([
      base44.entities.HireInterview.list("-interview_date", 200),
      base44.entities.Conference.list("-scheduled_date", 200),
      base44.entities.HireCandidate.list("-created_date", 200),
      base44.entities.VideoRecording.list("-created_date", 200),
    ]);
    const allCandidates = candRes?.data ?? candRes ?? [];
    const archivedIds = new Set(allCandidates.filter(c => c.archived || c.status === "declined").map(c => c.id));
    // Hide interviews belonging to archived (declined) candidates
    setInterviews((ivRes?.data ?? ivRes ?? []).filter(iv => !iv.candidate_id || !archivedIds.has(iv.candidate_id)));
    setConferences(confRes?.data ?? confRes ?? []);
    // Build room_name -> recording map
    const recs = recRes?.data ?? recRes ?? [];
    const byRoom = {};
    recs.forEach(r => { if (r.room_name && r.file_url) byRoom[r.room_name] = r; });
    setRecordingsByRoom(byRoom);
  } catch { setInterviews([]); setConferences([]); }
};
```

**Each conference card renders:**
- `ConvertToAiButton` — converts the conference to AI interview mode (calls `convertConferenceToAi`)
- `ConvertToHumanButton` — converts back to human interview mode (calls `convertConferenceToHuman`)
- Recording button (if `recordingsByRoom[c.room_name]` exists) — calls `handlePlayRecording`
- Questionnaire button — opens the scorecard/questionnaire for this conference
- Disqualify button — calls `disqualifyMissedInterview` backend function

---

### Change 9: Sync DOB + Resume URL from JobApplication to HireCandidate

**File:** `base44/functions/syncApplicationToKhethaIQ/entry.ts`

**Behavior:** When syncing a JobApplication into a local HireCandidate, the function must copy the applicant's date of birth (`dob`) and resume URL (`portfolio_link` → `resume_url`) onto the candidate record. For existing candidates created before these fields were synced, it must backfill them if missing. This enables age display and resume access in the candidate detail panel.

**Key implementation — backfill for existing candidates (add after finding an existing candidate by email):**
```typescript
// Backfill dob/resume_url for candidates created before these fields were synced
const updates = {};
if (!localCandidate.dob && application.dob) updates.dob = application.dob;
if (!localCandidate.resume_url && application.portfolio_link) updates.resume_url = application.portfolio_link;
if (Object.keys(updates).length > 0) {
  await base44.asServiceRole.entities.HireCandidate.update(localCandidate.id, updates).catch(() => {});
}
```

**Key implementation — set on new candidate creation:**
```typescript
const newCand = await base44.asServiceRole.entities.HireCandidate.create({
  job_id: application.job_id || null,
  name: application.full_name || "",
  email,
  phone: application.phone || "",
  dob: application.dob || null,           // ← date of birth for age display
  target_role: application.position || "media_specialist",
  resume_url: application.portfolio_link || "",  // ← resume/portfolio URL
  shared_person_id: sharedPersonId,
  // ... resume_text, cover_letter, status, decision, documents ...
});
```

**Make sure the `HireCandidate` entity has these fields:**
- `dob` (string, format: date) — "Candidate date of birth (synced from JobApplication for age display)"
- `resume_url` (string) — "Uploaded resume file URL"

---

### Change 10: Display Candidate Age + Resume in Candidate Detail Panel

**File:** `src/components/hireiq/CandidateDetailPanel.jsx`

**Behavior:** The candidate detail panel must display the candidate's age (calculated from DOB) as a badge next to their status, and show "View Resume" + "Download" buttons if a `resume_url` exists.

#### 10a. Age calculation helper (add at top of file, outside the component):
```jsx
function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
```

#### 10b. Age badge in the candidate header (next to status badge):
```jsx
<div className="flex items-center gap-2 mt-2">
  <span className="inline-block text-xs px-2 py-0.5 rounded"
    style={{ backgroundColor: "#2A2A2A", color: "#FFFBF5" }}>
    {candidate?.status}
  </span>
  {calculateAge(candidate?.dob) != null && (
    <span className="inline-block text-xs px-2 py-0.5 rounded"
      style={{ backgroundColor: "rgba(184,149,106,0.15)", color: "#B8956A" }}>
      Age {calculateAge(candidate.dob)}
    </span>
  )}
</div>
```

#### 10c. Resume buttons in the candidate header (top-right):
```jsx
{candidate?.resume_url && (
  <div className="flex gap-2">
    <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer">
      <Button variant="outline"
        style={{ backgroundColor: "transparent", color: "#FFFBF5", border: "1px solid rgba(184,149,106,0.2)" }}>
        <FileText className="w-4 h-4 mr-2" /> View Resume
      </Button>
    </a>
    <a href={candidate.resume_url} download>
      <Button variant="outline"
        style={{ backgroundColor: "transparent", color: "#FFFBF5", border: "1px solid rgba(184,149,106,0.2)" }}>
        <Download className="w-4 h-4 mr-2" /> Download
      </Button>
    </a>
  </div>
)}
```

---

### Required Entity Fields

Make sure the `Conference` entity has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `interview_mode` | enum: "human" \| "ai" | Default "human" |
| `tavus_conversation_id` | string | Tavus conversation ID |
| `tavus_conversation_status` | string | Last known status (active, ended) |
| `tavus_started_at` | date-time | When AI interview started |
| `tavus_completed_at` | date-time | When AI interview completed |
| `tavus_meeting_token` | string | Tavus meeting token (for auth) |
| `tavus_review_required` | boolean | True when transcript needs manual review |
| `tavus_scorecard_saved` | boolean | Whether parsed scorecard was saved |
| `recording_url` | string | Primary recording URL (or `s3://` URI) |
| `recording_status` | enum: "none" \| "recording" \| "ready" \| "failed" | Default "none" |
| `recording_duration_seconds` | integer | Recording duration |
| `tavus_recording_storage_uri` | string | Permanent S3 URI from Tavus |
| `twilio_room_sid` | string | Twilio room SID |
| `twilio_composition_sid` | string | Twilio composition SID |
| `twilio_composition_url` | string | Twilio composition download URL |
| `participants` | array of { id, name, email } | Invited participants |
| `round1_scorecard` | object | Scorecard result |
| `scorecard_completed_at` | date-time | When scorecard was completed |

Also needed: `VideoRecording` entity (file_url, duration_seconds, file_size, recorded_by_id, recorded_by_name, participant_name, room_name), `TavusInterviewTranscript` entity, and the `HireCandidate` entity must have `dob` (date) and `resume_url` (string) fields. (file_url, duration_seconds, file_size, recorded_by_id, recorded_by_name, participant_name, room_name) and `TavusInterviewTranscript` entity.

### Required Secrets

- `TAVUS_API_KEY` — Tavus API key
- `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ROLE_ARN` — for Tavus server-side recording storage
- `BASE44_APP_DOMAIN` — used to build the Tavus callback URL
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` — for Twilio video recording

### Required NPM Package

`@daily-co/daily-js` must be installed for the TavusInterviewPanel to join Tavus conversations via the Daily SDK.

### Required Backend Functions

- `createTavusInterviewConversation` — creates/reuses Tavus conversations
- `endTavusInterview` — ends a Tavus conversation server-side
- `tavusInterviewCallback` — handles Tavus webhooks (recording, transcript, shutdown)
- `saveInterviewRecording` — saves recording URLs, handles failures, promotes Twilio backup
- `getTavusRecordingUrl` — generates presigned S3 URLs for Tavus recordings
- `getTwilioRecordingUrl` — generates URLs for Twilio compositions
- `ensureTwilioRecordingRoom` — creates a Twilio room with server-side recording before anyone joins
- `convertConferenceToAi` — converts a conference to AI interview mode
- `convertConferenceToHuman` — converts back to human interview mode
- `disqualifyMissedInterview` — disqualifies a candidate for missing their interview

---

### Testing Checklist

After implementing all changes, verify:

1. **AI interview join:** Open an AI interview link → recording notice → "I Understand" → "Join Call" → AI interviewer appears → recording starts automatically (red REC indicator visible with timer)
2. **Recording compositing (AI):** After the call, check the recording — it should show the AI interviewer full-frame with the candidate as a PIP overlay in the bottom-right
3. **Recording compositing (human):** Start a human interview, manually start recording, end the call — the recording should show both participants
4. **Stale conversation recovery:** Join an AI interview, leave, then rejoin — it should create a new conversation without a 500 error (stale ones get ended automatically)
5. **Close button in new tab:** Open an interview link in a new browser tab → join → end call → the close button should redirect to home (not silently fail)
6. **Memory:** Join an AI interview as the same candidate twice — Ashley should recognize the returning candidate and welcome them back
7. **PAL-initiated end:** If Ashley ends the call, the "Call Ended" overlay should appear and the recording should be saved
8. **Recording cleanup:** After any call ends, check browser DevTools — no orphaned canvas streams or hidden video elements should remain
9. **S3 recording playback:** In the admin Interviews view, click "Recording" on a conference with an `s3://` URL — it should open a presigned URL in a new tab
10. **Convert AI/Human:** Click "AI Interviewer" on a human conference — it should convert to AI mode. Click "Human Interviewer" on an AI conference — it should convert back.
11. **Disqualify:** Click "Disqualify" on a conference — it should mark the candidate as "offer not extended" and schedule a notice email
12. **Saving recording overlay:** When ending an AI interview, the "Saving recording…" overlay should appear briefly while the final segment uploads, then close
13. **Age display:** Open a candidate with a DOB — an "Age {X}" gold badge should appear next to their status in the detail panel
14. **Resume buttons:** Open a candidate with a resume_url — "View Resume" and "Download" buttons should appear in the top-right of the detail panel
15. **DOB/resume sync:** When a new JobApplication is synced to KhethaIQ, the HireCandidate should have `dob` and `resume_url` populated. For existing candidates missing these fields, they should be backfilled on the next sync.