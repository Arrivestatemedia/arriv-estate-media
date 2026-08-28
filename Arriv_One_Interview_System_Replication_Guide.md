# Arriv One Interview System Replication Guide

This guide documents the complete interview recording system used in the Arriv Estate Media app, including the manual local recording, the Twilio server-side backup, and the seamless failover logic that ensures recordings always save without the user ever knowing a failure occurred.

---

## 1. Entity Schemas

### Conference

The `Conference` entity is the central record for every scheduled interview. Key recording-related fields:

| Field | Type | Description |
|---|---|---|
| `room_name` | string | Twilio video room name (used to join + link recordings) |
| `interview_mode` | enum `human` / `ai` | `human` uses Twilio Video; `ai` uses Tavus CVI |
| `recording_url` | string | URL of the local MediaRecorder upload (primary recording) |
| `recording_status` | enum `none` / `recording` / `ready` / `failed` | Status of the local recording — drives the failover logic |
| `recording_duration_seconds` | integer | Duration of the local recording in seconds |
| `twilio_room_sid` | string | Twilio Video room SID (set when room is created with server-side recording) |
| `twilio_composition_sid` | string | Twilio Composition SID (set when composition is created after room ends) |
| `twilio_composition_url` | string | Twilio Composition media download URL (backup recording for human interviews) |
| `tavus_conversation_id` | string | Tavus CVI conversation ID (AI interviews only) |
| `tavus_recording_storage_uri` | string | Tavus server-side recording storage URI (backup for AI interviews) |
| `participants` | array | List of invited participants (name, email, id) — used to link recordings to HireCandidate |

### HireCandidate

The `HireCandidate` entity stores candidate data. Recording-related and key fields:

| Field | Type | Description |
|---|---|---|
| `name` | string | Candidate full name |
| `email` | string | Candidate email (used to link recordings via Conference participants) |
| `phone` | string | Candidate phone |
| `dob` | date | Candidate date of birth — **synced from JobApplication for age display** |
| `resume_url` | string | Uploaded resume file URL |
| `resume_text` | string | Raw or pasted resume text |
| `resume_analysis` | object | AI resume analysis result |
| `documents` | array | Additional uploaded documents — **interview recordings are pushed here** |
| `status` | enum | Candidate workflow status |
| `target_role` | enum `media_specialist` / `sales_growth_advisor` / `other` | Which role the candidate is being recruited for |
| `archived` | boolean | Whether this candidate has been archived (declined) |

**Resume & Age Sync:** The `dob` and `resume_url`/`resume_text` fields are synced from the `JobApplication` entity when an application is synced to KhethaIQ via the `syncApplicationToKhethaIQ` backend function. The `dob` field powers the age display in the candidate detail panel.

### VideoRecording

The `VideoRecording` entity logs every uploaded recording for the Recordings page:

| Field | Type | Description |
|---|---|---|
| `file_url` | string | Uploaded recording file URL |
| `duration_seconds` | integer | Recording duration |
| `file_size` | integer | File size in bytes |
| `recorded_by_id` | string | Sales team member ID who recorded |
| `recorded_by_name` | string | Name of the recorder |
| `participant_name` | string | Name of the other participant |
| `room_name` | string | Twilio room name |

### TavusInterviewTranscript

Stores normalized transcripts from Tavus AI interviews:

| Field | Type | Description |
|---|---|---|
| `conference_id` | string | Conference ID this transcript belongs to |
| `conversation_id` | string | Tavus conversation ID |
| `transcript` | array | Normalized transcript entries (role, content, timestamp, duration) |
| `parsed_scorecard` | object | Parsed questionnaire responses mapped from transcript |
| `scorecard_saved` | boolean | Whether parsed responses were written to scorecard storage |

---

## 2. Twilio Server-Side Backup Recording (Human Interviews)

### Architecture

Twilio Video rooms are created with `RecordParticipantsOnConnect=true`, so Twilio records all participants server-side from the moment they connect. When the room ends, a Composition is created to combine all audio/video tracks into a single MP4. This serves as the backup recording for human interviews.

### Conference.jsx — Room Creation Before Join

When the Conference page loads for a human interview, it calls `ensureTwilioRecordingRoom` **before** the video panel connects:

```jsx
// Step 1: Check interview mode + ensure Twilio recording room BEFORE anyone joins
base44.entities.Conference.filter({ room_name: room }, "-created_date", 1)
  .then(async res => {
    const conf = (res?.data ?? res ?? [])[0];
    if (conf?.interview_mode === "ai") {
      setInterviewMode("ai");
    } else {
      // Human interview — create the Twilio room with server-side recording
      // BEFORE the video panel connects, so recording is on from the start.
      await base44.functions.invoke("ensureTwilioRecordingRoom", { roomName: room });
    }
  })
```

This must complete before `autoStart` is set, otherwise the participant might connect to an implicitly-created room (no recording).

### Backend: `ensureTwilioRecordingRoom`

Creates a Twilio group room with recording enabled:

```typescript
const params = new URLSearchParams();
params.append('UniqueName', roomName);
params.append('Type', 'group');
params.append('RecordParticipantsOnConnect', 'true');
params.append('StatusCallback', callbackUrl);  // → /functions/twilioRecordingCallback
params.append('StatusCallbackMethod', 'POST');
```

Saves the `twilio_room_sid` to the Conference record. If the room already exists (error 20404), it returns success (room may already have recording).

### Backend: `twilioRecordingCallback` (Webhook)

Receives Twilio status callbacks. Two key events:

**`room-ended`:** Creates a Composition (1280×720 MP4) combining all tracks:

```typescript
params.append('RoomSid', roomSid);
params.append('AudioSources', '*');
params.append('VideoLayout', JSON.stringify({ main: { video_sources: ['*'] } }));
params.append('Resolution', '1280x720');
params.append('Format', 'mp4');
```

Saves `twilio_composition_sid` to the Conference.

**`composition-available`:** Saves the composition media URL to the Conference, then decides how to label it on the candidate's profile based on `recording_status`:

- `recording_status === "ready"` → Local succeeded → push as **"Backup Recording"** (`type: "twilio_backup_recording"`)
- `recording_status === "failed"` → Local failed → push as **"Interview Recording"** (`type: "interview_recording"`) — user never knows
- `recording_status === "recording"` or `"none"` → Don't push yet; `saveInterviewRecording` will handle it when the local upload finishes

### Backend: `getTwilioRecordingUrl`

Generates a fresh, directly-downloadable S3 URL for a Twilio composition on demand. Called from the admin UI when viewing an applicant's backup recording.

```typescript
const mediaUrl = await getCompositionMediaUrl(compositionSid);
return Response.json({ mediaUrl });
```

### Shared Module: `base44/shared/twilioRecording.ts`

Contains the raw Twilio REST API helpers:
- `createRecordingRoom(roomName)` — creates a room with `RecordParticipantsOnConnect=true`
- `createComposition(roomSid)` — creates a 1280×720 MP4 composition
- `getCompositionMediaUrl(compositionSid)` — fetches a temporary S3 download URL

Uses raw `fetch` calls (not the `twilio` npm package) to avoid Deno incompatibility with `fetch` cache options.

---

## 3. Local Manual Recording (VideoCallPanelV2)

### Design Principles

- **No auto-record** — human calls only record when the user manually presses the record button
- **Best quality** — MediaRecorder uses the browser's default (highest) quality; no bitrate cap
- **Always attempts cloud upload** — no file size skip; every recording attempts upload
- **3 retries with backoff** (2s → 4s) so transient network blips don't lose the recording
- **Generous timeouts** — 60s for files < 50MB, 180s for larger files
- **Local copy always kept** as a final fallback if all 3 upload attempts fail

### Recording Flow

1. **User presses record** → `toggleRecording()` collects remote video track + mixed audio (remote + local)
2. **MediaRecorder created** with default quality, `recorder.start(1000)` (1-second timeslice)
3. **`saveInterviewRecording` called with `recordingStarted: true`** → sets `recording_status: "recording"` on the Conference so the Twilio webhook knows to wait
4. **User stops recording** → `recorder.stop()` fires `onstop` handler
5. **Blob created** from collected chunks; local object URL created immediately (always playable)
6. **Upload with 3 retries:**
   ```javascript
   for (let attempt = 1; attempt <= 3; attempt++) {
     try {
       const res = await uploadWithTimeout(file, timeoutMs);
       file_url = res.file_url;
       break;
     } catch (err) {
       lastErr = err;
       if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
     }
   }
   ```
7. **On success:** `saveInterviewRecording` called with `recordingUrl` → saves to VideoRecording entity, Conference, and HireCandidate documents
8. **On failure (all 3 retries):** `saveInterviewRecording` called with `failed: true` → promotes Twilio backup to primary

### Track Collection

The recording stream combines:
- **Remote video track** (the other participant's video)
- **Mixed audio** (remote audio + local microphone audio, mixed via AudioContext)

```javascript
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();
// Add remote audio
remoteAudioTracks.forEach(track => {
  const source = audioContext.createMediaStreamSource(new MediaStream([track]));
  source.connect(destination);
});
// Add local microphone
const localSource = audioContext.createMediaStreamSource(localStream);
localSource.connect(destination);
// Combined stream = remote video + mixed audio
const combinedStream = new MediaStream([
  ...remoteVideoTracks,
  ...destination.stream.getAudioTracks(),
]);
```

---

## 4. Seamless Failover Logic

### Goal

If the local recording upload fails, the Twilio server-side backup is automatically promoted to the primary recording. The user (admin viewing the candidate profile) never knows the local recording failed.

### State Machine

```
                    ┌─────────┐
 User presses ──→   │ recording │
 record             └────┬─────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
     Upload succeeds            Upload fails (3 retries)
           │                           │
           ▼                           ▼
    ┌──────────┐               ┌──────────┐
    │  ready   │               │  failed  │
    └──────────┘               └──────────┘
         │                           │
         ▼                           ▼
   Local = primary           Twilio = primary
   Twilio = backup            (no "backup" label)
```

### Backend: `saveInterviewRecording`

This function handles three modes:

**1. `recordingStarted: true`** — Called when the user presses record:
```typescript
if (recordingStarted) {
  await Conference.update(conference.id, { recording_status: "recording" });
  return;
}
```

**2. `failed: true`** — Called when all 3 upload retries fail:
```typescript
if (failed) {
  await Conference.update(conference.id, { recording_status: "failed" });
  
  // If Twilio composition already exists, promote it to primary now
  if (conference.twilio_composition_url && participant?.email) {
    existingDocs.push({
      type: "interview_recording",        // ← primary, not backup
      url: conference.twilio_composition_url,
      composition_sid: conference.twilio_composition_sid,
      label: "Interview Recording",      // ← no mention of backup
      conference_id: conference.id,
      created_at: new Date().toISOString(),
    });
    await HireCandidate.update(candidate.id, { documents: existingDocs });
  }
  // If no composition yet, twilioRecordingCallback will see recording_status="failed"
  // and push the composition as primary when it arrives
  return;
}
```

**3. Normal success** — Called with `recordingUrl` after successful upload:
```typescript
// Set recording_status = "ready"
await Conference.update(conference.id, {
  recording_url: recordingUrl,
  recording_status: "ready",
  recording_duration_seconds: durationSeconds,
});

// Create VideoRecording entity (deduped by file_url)
// Push local recording to HireCandidate documents as primary
newDocs.push({
  type: "interview_recording",
  url: recordingUrl,
  label: `Interview Recording (${mm}:${ss})`,
});

// If Twilio composition already arrived, add it as backup
if (conference.twilio_composition_url) {
  newDocs.push({
    type: "twilio_backup_recording",
    url: conference.twilio_composition_url,
    composition_sid: conference.twilio_composition_sid,
    label: "Backup Recording",
  });
}
```

### Timing Scenarios

| Scenario | Local finishes | Twilio composition arrives | Result |
|---|---|---|---|
| A | Succeeds first | After | `twilioRecordingCallback` sees `ready` → pushes Twilio as backup |
| B | Fails first | After | `twilioRecordingCallback` sees `failed` → pushes Twilio as primary |
| C | Succeeds after | First | Composition saved to Conference (not pushed); `saveInterviewRecording` pushes local + Twilio as backup |
| D | Fails after | First | Composition saved to Conference (not pushed); `saveInterviewRecording` promotes Twilio as primary |

### Duplicate Prevention

All candidate document pushes check for existing entries by `composition_sid` or `url`:
```typescript
const alreadyHas = existingDocs.some(
  d => d?.composition_sid === compositionSid || d?.url === mediaUrl
);
```

---

## 5. Tavus AI Interview Recording

### Architecture

AI interviews use Tavus CVI (Conversational Video Interface) via the Daily.co JS SDK. Recording is dual-layer:

1. **Tavus server-side recording** — automatic (`auto_start_recording` enabled on conversation creation), stored by Tavus, URI saved via webhook
2. **Local client-side recording** — `MediaRecorder` captures the Daily.co call stream, uploaded to our storage

### TavusInterviewPanel.jsx

- Uses Daily.co JS SDK for the video stream (pixel-perfect parity with VideoCallPanelV2 UX)
- `MediaRecorder` captures local + remote audio/video tracks
- Automatic recording starts when the remote stream arrives
- Pre-call recording consent overlay with mandatory "I Understand" acknowledgment
- Visible red pulsing "● REC" indicator with live timer during recorded calls

### Backend Functions

- `createTavusInterviewConversation` — creates a Tavus CVI conversation with `auto_start_recording: true`
- `tavusInterviewCallback` — handles Tavus webhooks (transcript ready, recording ready, conversation ended)
- `endTavusInterview` — ends a Tavus conversation
- `convertConferenceToAi` — converts a scheduled human interview to AI mode (preserves meeting URL)

### Tavus Recording Storage

The `tavus_recording_storage_uri` field on Conference is set from the `recording_ready` webhook. This is the backup recording for AI interviews, parallel to the Twilio composition for human interviews.

---

## 6. Resume & Age Sync

### JobApplication → HireCandidate

When a job application is synced to KhethaIQ via `syncApplicationToKhethaIQ`, the following fields are copied from `JobApplication` to `HireCandidate`:

| JobApplication field | HireCandidate field | Purpose |
|---|---|---|
| `full_name` | `name` | Candidate name |
| `email` | `email` | Candidate email |
| `phone` | `phone` | Candidate phone |
| `dob` | `dob` | **Date of birth — used for age display in candidate detail panel** |
| `resume_url` (from documents) | `resume_url` | Uploaded resume file URL |
| `resume_text` (from pasted text) | `resume_text` | Raw or pasted resume text |
| `position` | `target_role` | Which role the candidate applied for |

### Age Display

The `dob` field on `HireCandidate` is used to calculate and display the candidate's age in the `CandidateDetailPanel` component. This is denormalized from `JobApplication` at sync time so the age is always available without a cross-entity lookup.

---

## 7. Interview Scheduling

### `scheduleConference` Backend Function

Creates a Conference record, generates a Google Calendar event, and sends confirmation emails.

**Conflict detection:** Checks for existing conferences with overlapping time slots before creating:
```typescript
const existing = await Conference.filter({
  scheduled_date: date,
  scheduled_time: time,
  status: { $in: ["scheduled", "in_progress"] },
});
// Returns 409 if overlap detected
```

### `InterviewSchedulerModal` Component

Admin UI for scheduling interviews:
- Date, time, duration, participant selection
- Real-time conflict detection (monitors date/time/duration inputs)
- Toggle between human and AI interview mode
- Sends calendar invites + confirmation emails on submit

### Automated CC

All scheduled interview emails include an automated administrative carbon-copy (CC) to ensure visibility.

---

## 8. Recording Consent & UX

### Pre-Call Overlay

All recorded calls (human and AI) display a mandatory pre-call overlay:
- Explicit "I Understand" acknowledgment required
- Explains that the call will be recorded
- Blocks joining until acknowledged

### Recording Indicator

During all recorded calls:
- Visible, persistent, red pulsing "● REC" indicator
- Live timer showing elapsed recording time
- Displayed in the call header area

---

## 9. File Structure

```
base44/
  functions/
    ensureTwilioRecordingRoom/entry.ts    # Creates Twilio room with recording
    twilioRecordingCallback/entry.ts       # Webhook: room-ended → composition, composition-available → save
    getTwilioRecordingUrl/entry.ts         # On-demand S3 URL for composition
    saveInterviewRecording/entry.ts        # Saves local recording + failover logic
    createTavusInterviewConversation/entry.ts
    tavusInterviewCallback/entry.ts
    endTavusInterview/entry.ts
    convertConferenceToAi/entry.ts
    scheduleConference/entry.ts
  shared/
    twilioRecording.ts                     # Twilio REST API helpers (raw fetch)
    tavusInterview.ts                      # Tavus API helpers
    interviewScheduledEmail.ts             # Email templates

src/
  pages/
    Conference.jsx                         # Gateway: routes to human or AI panel
  components/
    sales/
      VideoCallPanelV2.jsx                 # Human interview video panel + local recording
    interviews/
      TavusInterviewPanel.jsx              # AI interview video panel (Daily.co)
      ConvertToAiButton.jsx                # Toggle to convert human → AI
    admin/
      InterviewSchedulerModal.jsx         # Schedule interviews
    hireiq/
      CandidateDetailPanel.jsx             # Candidate profile with recordings
```

---

## 10. Secrets Required

| Secret | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio API auth |
| `TWILIO_AUTH_TOKEN` | Twilio API auth |
| `TAVUS_API_KEY` | Tavus CVI API auth |
| `BASE44_APP_DOMAIN` | Used to construct webhook callback URLs |

### Webhook URLs (configure in Twilio dashboard)

- **Twilio Video Status Callback:** `https://arrivestatemedia.base44.app/functions/twilioRecordingCallback`
- **Tavus Webhook:** `https://arrivestatemedia.base44.app/functions/tavusInterviewCallback`

---

## 11. Changes Made After "IT ABSOLUTELY HAS TO WORK" Point

The following changes were made after the user's instruction to ensure all calls record and save reliably:

1. **Removed auto-record from VideoCallPanelV2** — human interviews only record when the user manually presses the record button (per user preference for manual control)

2. **Added 3-retry upload logic** — replaced the 50MB file size skip with a retry-based approach that always attempts cloud upload (3 attempts with 2s/4s backoff, 60s timeout for < 50MB, 180s for larger)

3. **Removed bitrate cap** — MediaRecorder uses the browser's default (highest) quality for best video quality

4. **Added `recordingStarted` flag** — when the user presses record, `saveInterviewRecording` is called with `recordingStarted: true` to set `recording_status: "recording"` on the Conference, so the Twilio webhook knows to wait before labeling

5. **Added `failed` flag** — when all 3 upload retries fail, `saveInterviewRecording` is called with `failed: true` to set `recording_status: "failed"` and promote the Twilio backup to primary

6. **Updated `twilioRecordingCallback`** — the composition-available handler now checks `recording_status` to decide labeling:
   - `ready` → backup
   - `failed` → primary (user never knows)
   - `recording`/`none` → wait for local to finish

7. **Updated `saveInterviewRecording`** — now handles three modes (recordingStarted, failed, normal success) and manages the full failover logic including pushing Twilio as backup on success or primary on failure

8. **Added error logging** — `saveInterviewRecording` and `VideoCallPanelV2` errors are now logged instead of silently swallowed, making failures traceable

9. **Backend duplicate check** — `saveInterviewRecording` checks for existing VideoRecording entities by `file_url` before creating, preventing duplicate records during recording saves