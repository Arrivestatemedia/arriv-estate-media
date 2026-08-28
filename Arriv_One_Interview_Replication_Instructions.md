# Arriv One — Interview System Replication Instructions

Copy and paste the entire block below into the Arriv One builder chat. It covers every change made to the Estate Media interview system after the "Connection failed: 500" point, so Arriv One gets the same fixes and features.

---

## COPY EVERYTHING BELOW THIS LINE

I need you to implement the following set of changes to our interview system. These are battle-tested fixes and features from our Estate Media app that need to be replicated here in Arriv One. Each section describes the file to create or modify, the exact behavior required, and the code to use.

### Overview

There are 8 changes total:

1. **Stale Tavus conversation cleanup** — automatically end stale Tavus conversations before creating new ones (fixes the "Connection failed: 500" error caused by Tavus concurrent conversation limits)
2. **Conference close button fix** — the X / hangup button must work even when the interview page was opened in a new browser tab (from an email link)
3. **Canvas compositing for AI interview recordings** — the Tavus AI interview recording must show BOTH the AI interviewer (full frame) AND the candidate (picture-in-picture), not just the AI
4. **Canvas compositing for human interview recordings** — the Twilio human interview recording must show BOTH participants (remote full frame + local PIP)
5. **Recording cleanup on session end** — composite canvases, hidden video elements, and composite streams must be properly cleaned up when a call ends to prevent memory leaks and ghost recordings
6. **Tavus memory_stores for returning candidates** — pass the candidate's email as a stable memory store identifier so the AI interviewer (Ashley) remembers the candidate across multiple interviews and proactively welcomes them back
7. **Sync DOB + resume URL from JobApplication to HireCandidate** — copy `dob` and `portfolio_link` (as `resume_url`) onto the candidate record, with backfill for existing candidates
8. **Display candidate age + resume in Candidate Detail Panel** — show an "Age {X}" badge calculated from DOB, "View Resume"/"Download" buttons from `resume_url`, and resolve `s3://` recording URIs in candidate documents to presigned URLs

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

**Behavior:** The `createTavusConversation` function needs a new optional `memoryStore` parameter. When provided, it's passed as `memory_stores` in the Tavus API request body. Per Tavus docs, `memory_stores` should be a stable, unique identifier for the user (e.g. user email, CRM ID). This lets the PAL remember the candidate across conversations.

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

**Find or create the `Conference` page component and ensure it has this close handler:**

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

**Pass `handleClose` as the `onClose` prop to both `TavusInterviewPanel` and `VideoCallPanelV2`.**

---

### Change 4: Canvas Compositing for AI Interview Recordings (TavusInterviewPanel)

**File:** `src/components/interviews/TavusInterviewPanel.jsx`

**Behavior:** The AI interview recording must show BOTH the AI interviewer (full frame) AND the candidate (picture-in-picture overlay). Previously, only the AI's video was captured. The fix uses a composite canvas that draws the remote (AI) video full-frame with a cover-fit, then draws the local (candidate) video as a PIP in the bottom-right corner with a rounded border. The canvas stream (video) + mixed audio (remote + local) is what gets recorded.

**Key implementation details:**

1. **Refs needed (add to the component):**
```jsx
const compositeCanvasRef = useRef(null);
const compositeStreamRef = useRef(null);
const drawLoopRef = useRef(null);
const recRemoteVideoRef = useRef(null);
const recLocalVideoRef = useRef(null);
```

2. **The `startRecording` function** builds a composite canvas:
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
  // ... then start the MediaRecorder with these tracks
}, [startSegment]);
```

3. **The `stopRecording` function** must clean up the composite canvas and hidden video elements:
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
  // ... stop the MediaRecorder, close AudioContext, etc.
}, []);
```

4. **The Daily `left-meeting` event handler** must detect unexpected disconnects, stop the recording, show a "Call Ended" overlay, and NOT silently reset to idle:
```jsx
call.on("left-meeting", () => {
  if (callStateRef.current === "connected") {
    stopRecording();
    if (callRef.current) {
      try { callRef.current.destroy(); } catch (_) {}
      callRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    recordingStartedRef.current = false;
    base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
    updateCallState("ended");
  } else {
    updateCallState("idle");
  }
});
```

5. **`handleEndCall` must wait for the final recording segment upload** before closing, otherwise the browser unloads the page and cancels the in-flight upload:
```jsx
const handleEndCall = useCallback(async () => {
  stopRecording();
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
  base44.functions.invoke("endTavusInterview", { roomName }).catch(() => {});
  onClose();
}, [onClose, roomName, stopRecording]);
```

6. **UI overlays needed:**
   - A "Call Ended" overlay when `callState === "ended"` (shows when the meeting ends unexpectedly, with a Close button)
   - A "Saving recording…" overlay when `isSavingRecording` is true (spinner + message: "Please wait while your interview recording is uploaded. Closing now will lose the recording.")
   - A red pulsing "● REC" indicator with live timer, always visible during the call when recording
   - A pre-call recording notice overlay: "This interview will be recorded" with an "I Understand — Continue" button (must be acknowledged before joining)

---

### Change 5: Canvas Compositing for Human Interview Recordings (VideoCallPanelV2)

**File:** `src/components/sales/VideoCallPanelV2.jsx`

**Behavior:** The human interview recording (Twilio) must also show BOTH participants — the remote participant (interviewee) full-frame with the local participant (interviewer) as a PIP overlay. The implementation mirrors the AI panel's compositing.

**Key implementation details:**

1. **Refs needed:**
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

2. **In `toggleRecording` (start path), build the composite canvas:**
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

3. **In `recorder.onstop`, clean up the composite canvas and hidden videos:**
```jsx
if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
if (drawLoopRef.current) { cancelAnimationFrame(drawLoopRef.current); drawLoopRef.current = null; }
for (const ref of [recRemoteVideoRef, recLocalVideoRef]) {
  if (ref.current) { try { ref.current.srcObject = null; ref.current.remove(); } catch (_) {} ref.current = null; }
}
if (compositeStreamRef.current) { compositeStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); compositeStreamRef.current = null; }
compositeCanvasRef.current = null;
```

4. **In `handleEndCall`, clean up the same composite resources:**
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

5. **Store remote tracks when they arrive** (so the compositing can access them):
```jsx
// When subscribing to a remote participant's tracks:
remoteVideoTrackRef.current = videoTrack;
remoteAudioTrackRef.current = audioTrack;
```

---

### Change 6: Tavus Callback — Handle PAL-Initiated Call End

**File:** `base44/functions/tavusInterviewCallback/entry.ts`

**Behavior:** The Tavus PAL (Ashley) can now end calls herself when the interview wraps up. The callback must handle the `system.shutdown` and `system.conversation_ended` events to mark the conference as completed. This should already exist but verify it's present:

```typescript
if (eventType === "system.shutdown" || eventType === "system.conversation_ended") {
  await base44.asServiceRole.entities.Conference.update(conference.id, {
    tavus_conversation_status: "ended",
    tavus_completed_at: new Date().toISOString(),
    status: "completed",
  });
  return Response.json({ status: "success", action: "ended" });
}
```

---

### Change 7: Sync DOB + Resume URL from JobApplication to HireCandidate

**File:** `base44/functions/syncApplicationToKhethaIQ/entry.ts` (or equivalent application-to-candidate sync function)

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

### Change 8: Display Candidate Age + Resume in Candidate Detail Panel

**File:** `src/components/hireiq/CandidateDetailPanel.jsx` (or equivalent candidate detail component)

**Behavior:** The candidate detail panel must display the candidate's age (calculated from DOB) as a badge next to their status, show "View Resume" + "Download" buttons if a `resume_url` exists, and resolve `s3://` recording URIs in candidate documents to presigned URLs for playback.

#### 8a. Age calculation helper (add at top of file, outside the component):
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

#### 8b. Age badge in the candidate header (next to status badge):
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

#### 8c. S3 recording playback from candidate documents (add inside the component):
```jsx
const [loadingRecUrl, setLoadingRecUrl] = useState(null);

const handlePlayDocRecording = async (doc) => {
  const url = doc?.url || "";
  if (url.startsWith("s3://")) {
    setLoadingRecUrl(url);
    try {
      const res = await base44.functions.invoke("getTavusRecordingUrl", { storageUri: url });
      const presignedUrl = res?.url || res?.data?.url;
      if (presignedUrl) window.open(presignedUrl, "_blank", "noopener,noreferrer");
    } catch (_) {} finally { setLoadingRecUrl(null); }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
```

#### 8d. Resume buttons in the candidate header (top-right):
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

### Summary of Required Entity Fields

Make sure the `Conference` entity has these fields (they should already exist):

- `interview_mode` (enum: "human" | "ai", default "human")
- `tavus_conversation_id` (string)
- `tavus_conversation_status` (string)
- `tavus_started_at` (date-time)
- `tavus_completed_at` (date-time)
- `tavus_meeting_token` (string)
- `tavus_review_required` (boolean)
- `tavus_scorecard_saved` (boolean)
- `recording_url` (string)
- `recording_status` (enum: "none" | "recording" | "ready" | "failed")
- `recording_duration_seconds` (integer)
- `tavus_recording_storage_uri` (string)
- `participants` (array of { id, name, email })

Also needed: `HireCandidate` entity must have `dob` (string, date) and `resume_url` (string) fields, and `VideoRecording` entity (file_url, duration_seconds, file_size, recorded_by_id, recorded_by_name, participant_name, room_name).

### Required Backend Functions

- `createTavusInterviewConversation` — creates/reuses Tavus conversations
- `endTavusInterview` — ends a Tavus conversation server-side
- `tavusInterviewCallback` — handles Tavus webhooks (recording, transcript, shutdown)
- `saveInterviewRecording` — saves recording URLs, handles failures, promotes Twilio backup
- `getTavusRecordingUrl` — generates presigned S3 URLs for Tavus recordings (needed for S3 recording playback in candidate detail panel)
- `syncApplicationToKhethaIQ` — syncs JobApplication data (including dob + resume_url) to HireCandidate

### Required Secrets

Make sure these secrets are set:
- `TAVUS_API_KEY` — Tavus API key
- `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ROLE_ARN` — for Tavus server-side recording storage
- `BASE44_APP_DOMAIN` — used to build the Tavus callback URL

### Required NPM Package

The `@daily-co/daily-js` package must be installed for the TavusInterviewPanel to join Tavus conversations via the Daily SDK.

---

### Testing Checklist

After implementing all changes, verify:

1. **AI interview join:** Open an AI interview link → recording notice → "I Understand" → "Join Call" → AI interviewer appears → recording starts automatically (red REC indicator visible)
2. **Recording compositing (AI):** After the call, check the recording — it should show the AI interviewer full-frame with the candidate as a PIP overlay
3. **Recording compositing (human):** Start a human interview, manually start recording, end the call — the recording should show both participants
4. **Stale conversation recovery:** Join an AI interview, leave, then rejoin — it should create a new conversation without a 500 error (stale ones get ended automatically)
5. **Close button in new tab:** Open an interview link in a new browser tab → join → end call → the close button should redirect to home (not silently fail)
6. **Memory:** Join an AI interview as the same candidate twice — Ashley should recognize the returning candidate
7. **PAL-initiated end:** If Ashley ends the call, the "Call Ended" overlay should appear and the recording should be saved
8. **Recording cleanup:** After any call ends, check browser DevTools — no orphaned canvas streams or hidden video elements should remain
9. **Age display:** Open a candidate with a DOB — an "Age {X}" gold badge should appear next to their status in the detail panel
10. **Resume buttons:** Open a candidate with a resume_url — "View Resume" and "Download" buttons should appear in the top-right of the detail panel
11. **DOB/resume sync:** When a new JobApplication is synced, the HireCandidate should have `dob` and `resume_url` populated. For existing candidates missing these fields, they should be backfilled on the next sync.
12. **S3 recording in candidate docs:** Open a candidate whose documents contain an `s3://` interview recording — clicking play should resolve to a presigned URL and open in a new tab.