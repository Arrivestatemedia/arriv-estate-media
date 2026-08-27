# Arriv Estate Media — Dual-Mode AI/Human Interview System
## Complete Replication Guide for Arriv One

This document describes every component, entity, function, secret, webhook, and data flow
that was built for the interview system in Arriv Estate Media, so Arriv One can replicate it
exactly to a T.

---

## 1. Overview

The system supports two interview modes on the **same meeting link**:

| Mode | Interviewer | Video SDK | Server-Side Recording | Local Recording |
|------|------------|-----------|----------------------|-----------------|
| **Human** (`interview_mode: "human"`) | A human Arriv admin | Twilio Video | Twilio Compositions (backup) | MediaRecorder in browser (primary) |
| **AI** (`interview_mode: "ai"`) | Tavus CVI AI replica | Daily.co JS SDK | Tavus `auto_start_recording` (backup) | MediaRecorder in browser (primary) |

The mode is stored on the `Conference` entity as `interview_mode`. The same `/Conference?room=<roomName>`
URL works for both — the page reads `interview_mode` from the Conference record and renders the
appropriate panel. Switching modes after scheduling does **not** change the URL.

### Design principles enforced
- **No API keys on the client.** TAVUS_API_KEY and TWILIO_AUTH_TOKEN are server-side secrets only.
- **Dual-layer recording.** Every interview has a primary (local MediaRecorder upload) and a
  backup (server-side: Tavus cloud or Twilio Composition). Both are saved to the applicant profile.
- **Mandatory recording disclosure.** AI interviews show a pre-call consent overlay before joining.
- **Visible recording indicator.** A red pulsing dot + timer is shown at all times during recording.
- **Same UI shell.** The AI interview panel (TavusInterviewPanel) visually replicates the human
  interview panel (VideoCallPanelV2) — same controls, layout, PIP, header — so candidates cannot
  tell they are on a different product.
- **No double-booking.** The scheduler checks for time conflicts before allowing submission.
- **Same meeting link on mode switch.** Converting human→AI does not change the URL.

---

## 2. Entities

### 2.1 Conference Entity

The central record for every scheduled interview. Key fields added/modified:

```jsonc
{
  "name": "Conference",
  "type": "object",
  "properties": {
    // ... existing fields (title, description, scheduled_date, scheduled_time,
    //   duration_minutes, room_name, meeting_link, organizer_id, organizer_name,
    //   organizer_email, participants, google_calendar_event_id, status, channel_id) ...

    "interview_mode": {
      "type": "string",
      "enum": ["human", "ai"],
      "default": "human",
      "description": "Interview mode: 'human' uses Twilio Video; 'ai' uses Tavus CVI."
    },

    // ─── Tavus AI fields (set when AI conversation is created) ───
    "tavus_conversation_id": { "type": "string" },
    "tavus_conversation_status": { "type": "string" },
    "tavus_started_at": { "type": "string", "format": "date-time" },
    "tavus_completed_at": { "type": "string", "format": "date-time" },
    "tavus_meeting_token": { "type": "string" },
    "tavus_review_required": { "type": "boolean", "default": false },
    "tavus_scorecard_saved": { "type": "boolean", "default": false },

    // ─── Local recording fields (primary, both modes) ───
    "recording_url": { "type": "string" },
    "recording_status": { "type": "string", "enum": ["none","recording","ready","failed"], "default": "none" },
    "recording_duration_seconds": { "type": "integer" },

    // ─── Tavus server-side recording (backup, AI mode) ───
    "tavus_recording_storage_uri": { "type": "string" },

    // ─── Twilio server-side recording (backup, human mode) ───
    "twilio_room_sid": { "type": "string" },
    "twilio_composition_sid": { "type": "string" },
    "twilio_composition_url": { "type": "string" },

    // ─── Scorecard ───
    "round1_scorecard": { "type": "object" },
    "scorecard_completed_at": { "type": "string", "format": "date-time" }
  },
  "required": ["title", "scheduled_date", "scheduled_time", "organizer_id", "organizer_email"]
}
```

### 2.2 TavusInterviewTranscript Entity (NEW)

Stores the normalized transcript + parsed scorecard from each AI interview.

```jsonc
{
  "name": "TavusInterviewTranscript",
  "type": "object",
  "properties": {
    "conference_id": { "type": "string" },
    "conversation_id": { "type": "string" },
    "application_id": { "type": "string" },
    "candidate_id": { "type": "string" },
    "candidate_name": { "type": "string" },
    "transcript": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": { "type": "string" },        // "user" (candidate) or "assistant" (AI)
          "content": { "type": "string" },
          "timestamp": { "type": "number" },
          "seconds_from_start": { "type": "number" },
          "duration": { "type": "number" }
        }
      }
    },
    "raw_payload": { "type": "object" },
    "event_type": { "type": "string" },
    "status": { "type": "string", "enum": ["active","completed","error"], "default": "active" },
    "parsed_scorecard": { "type": "object" },
    "parsing_confidence": { "type": "number" },
    "review_required": { "type": "boolean", "default": false },
    "scorecard_saved": { "type": "boolean", "default": false },
    "received_at": { "type": "string", "format": "date-time" }
  },
  "required": ["conference_id", "conversation_id"]
}
```

### 2.3 HireCandidate Entity (modified)

The `documents` array receives recording entries. No schema change needed — `documents` is
already `array of objects`. Entries pushed:

**AI interview local recording:**
```json
{
  "type": "interview_recording",
  "url": "<file_url from UploadFile>",
  "label": "AI Interview Recording (MM:SS)",
  "conference_id": "<conference_id>",
  "created_at": "<ISO timestamp>"
}
```

**Twilio backup recording (human mode):**
```json
{
  "type": "twilio_backup_recording",
  "url": "<composition media URL>",
  "label": "Twilio Server-Side Recording (Backup)",
  "conference_id": "<conference_id>",
  "composition_sid": "<composition_sid>",
  "created_at": "<ISO timestamp>"
}
```

### 2.4 VideoRecording Entity (existing, reused)

Used by `saveInterviewRecording` for both modes:
```json
{
  "file_url": "<recordingUrl>",
  "duration_seconds": <number>,
  "file_size": <number>,
  "recorded_by_id": "<organizer_id or null>",
  "recorded_by_name": "<organizer_name or 'AI Interviewer'>",
  "participant_name": "<participant name>",
  "room_name": "<roomName>"
}
```

---

## 3. Secrets Required

| Secret Name | Purpose |
|-------------|---------|
| `TAVUS_API_KEY` | Tavus API authentication (sent as `x-api-key` header) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (for REST API: room creation, compositions) |
| `TWILIO_API_KEY` | Twilio API key (for access token generation) |
| `TWILIO_API_SECRET` | Twilio API secret (for access token generation) |
| `BASE44_APP_DOMAIN` | App domain for constructing webhook callback URLs (e.g. `https://yourapp.base44.app`) |

---

## 4. NPM Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `@daily-co/daily-js` | `^0.79.0` | Daily.co SDK for joining Tavus CVI conversations |
| `twilio` | `^5.3.3` (functions) / `^4.10.0` (legacy) | Twilio REST API for room creation + compositions |

Install in Arriv One: `npm install @daily-co/daily-js`

---

## 5. Shared Modules

### 5.1 `base44/shared/tavusInterview.ts`

Server-side only. Never import in frontend code.

**Constants:**
- `TAVUS_API_BASE = "https://tavusapi.com/v2"`
- `TAVUS_PAL_ID = "p5f532a78213"` — the Tavus PAL with the Arriv interview questionnaire + default Face. Change if recreated in Tavus dashboard.

**Functions:**
- `tavusHeaders()` — returns `{ "x-api-key": <TAVUS_API_KEY>, "Content-Type": "application/json" }`
- `getCallbackUrl()` — returns `${BASE44_APP_DOMAIN}/functions/tavusInterviewCallback`
- `createTavusConversation({ palId?, conversationName, requireAuth?, maxParticipants? })` — POST to `/conversations` with:
  ```json
  {
    "pal_id": "<palId or TAVUS_PAL_ID>",
    "conversation_name": "<conversationName>",
    "callback_url": "<callbackUrl>",
    "require_auth": true,
    "max_participants": 2,
    "properties": { "auto_start_recording": true }
  }
  ```
  Returns `{ conversation_id, conversation_url, meeting_token, ... }`
- `getTavusConversation(conversationId)` — GET `/conversations/{id}`, returns null on 404
- `endTavusConversation(conversationId)` — POST `/conversations/{id}/end`
- `ROUND1_QUESTIONS_FOR_LLM` — array of 19 questions mirroring `src/lib/round1Questions.js` (backend can't import src/)
- `parseTranscriptToScorecard(base44, transcript, candidateName?)` — uses `InvokeLLM` to map transcript utterances to Round 1 questions, returns `{ scorecard, confidence, review_required, all_answered }`

**Scorecard parsing logic:**
1. Filter transcript to `role === "user"` utterances only (candidate's words)
2. Build LLM prompt with all 19 Round 1 questions + candidate utterances
3. Ask LLM to return JSON: `{ answers: [{ question_id, answered, answer, rating (0-5), confidence (0-1), source_excerpt }] }`
4. Group answers by section, compute weighted section scores
5. `review_required = true` if avg confidence < 0.6 OR not all questions answered
6. Section weights: Communication 20, Confidence 15, Coachability 20, Work Ethic 15, Professionalism 10, Problem Solving 10, Culture Fit 10

### 5.2 `base44/shared/twilioRecording.ts`

Server-side only.

**Functions:**
- `getTwilioClient()` — returns `twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)`
- `getRecordingCallbackUrl()` — returns `${BASE44_APP_DOMAIN}/functions/twilioRecordingCallback`
- `createRecordingRoom(roomName)` — creates Twilio Video room with:
  ```json
  {
    "uniqueName": "<roomName>",
    "type": "group",
    "recordParticipantsOnConnect": true,
    "statusCallback": "<callbackUrl>",
    "statusCallbackMethod": "POST"
  }
  ```
  Returns `{ sid, uniqueName, status, ... }`
- `createComposition(roomSid)` — creates a Composition combining all recordings:
  ```json
  {
    "roomSid": "<roomSid>",
    "audioSources": ["*"],
    "videoLayout": { "main": { "video_sources": ["*"] } },
    "resolution": "1280x720",
    "format": "mp4",
    "statusCallback": "<callbackUrl>",
    "statusCallbackMethod": "POST"
  }
  ```
- `getCompositionMediaUrl(compositionSid)` — fetches fresh download URL for a composition

---

## 6. Backend Functions

### 6.1 `scheduleConference`
**Purpose:** Creates a Conference record, sends Google Calendar invite, sends confirmation email.
**Input:**
```json
{
  "title": "Sales Growth Advisor Interview — <name>",
  "description": "...",
  "scheduledDate": "YYYY-MM-DD",
  "scheduledTime": "HH:MM",
  "durationMinutes": 30,
  "participants": [{ "id": "<app_id>", "name": "<name>", "email": "<email>" }],
  "organizerId": "<sales_member_id>",
  "organizerName": "<name>",
  "organizerEmail": "<email>",
  "applicationId": "<app_id>",
  "interviewMode": "human" | "ai"
}
```
**Logic:**
1. Validate required fields
2. **Conflict detection:** Query all `Conference` records with `status: "scheduled"`, compute UTC start/end for each, check for overlap with requested slot. Return 409 with `conflict: true` if overlap found.
3. Generate `roomName = "conf-{timestamp}-{random9}"`
4. Create Conference entity with `interview_mode: interviewMode || "human"`, `meeting_link = "{BASE44_APP_DOMAIN}/Conference?room={roomName}"`
5. Create Google Calendar event via `googlecalendar` connector (converts ET input to UTC using Intl.DateTimeFormat with `America/New_York` timezone), send with `sendUpdates=all`
6. Save `google_calendar_event_id` to Conference
7. If `applicationId` provided, fetch `JobApplication`, send confirmation email via `sendInterviewScheduledEmail` + admin CC via `sendInterviewScheduledAdminCopy`
**Output:** `{ success, email_sent, conference: { id, title, roomName, meetingLink, scheduledDate, scheduledTime } }`

### 6.2 `createTavusInterviewConversation`
**Purpose:** Creates (or reuses) a Tavus CVI conversation for an AI interview.
**Input:** `{ roomName }`
**Logic:**
1. Find Conference by `room_name`
2. Verify `interview_mode === "ai"` (403 if not)
3. If `tavus_conversation_id` exists, check if still active via `getTavusConversation`. If active, return existing URL + token with `reused: true`.
4. Otherwise, call `createTavusConversation({ conversationName: "Arriv Interview - {title}", requireAuth: true, maxParticipants: 2 })`
5. Save `tavus_conversation_id`, `tavus_conversation_status: "active"`, `tavus_started_at`, `tavus_meeting_token` to Conference
**Output:** `{ status: "success", conversationId, conversationUrl, meetingToken, reused }`

### 6.3 `endTavusInterview`
**Purpose:** Ends a Tavus conversation server-side.
**Input:** `{ roomName }`
**Logic:**
1. Find Conference by `room_name`
2. If `tavus_conversation_id` exists, call `endTavusConversation`
3. Update Conference: `tavus_conversation_status: "ended"`, `tavus_completed_at`, `status: "completed"`
**Output:** `{ status: "success" }`

### 6.4 `tavusInterviewCallback`
**Purpose:** Webhook handler for Tavus events. Registered as the `callback_url` on every conversation.
**Input:** JSON body from Tavus (varies by event type)
**Logic:**
1. Extract `event_type` and `conversation_id` from body
2. Find Conference by `tavus_conversation_id`
3. Handle events:
   - `system.pal_joined` / `system.replica_joined` → set `tavus_conversation_status: "active"`
   - `system.shutdown` / `system.conversation_ended` → set `tavus_conversation_status: "ended"`, `tavus_completed_at`, `status: "completed"`
   - `application.recording_ready` → extract `storage_uri` from `properties`, save to `tavus_recording_storage_uri`
   - `application.recording_copy_failed` → log warning
   - `application.transcription_ready` / `application.transcription` → normalize transcript, call `parseTranscriptToScorecard`, create `TavusInterviewTranscript` record, save scorecard to Conference + HireCandidate if `!review_required`, set `tavus_review_required` if review needed
4. Always return 200 to prevent Tavus retries

### 6.5 `saveInterviewRecording`
**Purpose:** Saves a local MediaRecorder upload to Conference + VideoRecording + HireCandidate.
**Input:** `{ roomName, recordingUrl, durationSeconds, fileSize }`
**Logic:**
1. Find Conference by `room_name`
2. Update Conference: `recording_url`, `recording_status: "ready"`, `recording_duration_seconds`
3. Create `VideoRecording` record
4. If participant email exists, find `HireCandidate` by email, push `{ type: "interview_recording", url, label, conference_id, created_at }` to `documents` array
**Output:** `{ status: "success", conferenceId }`

### 6.6 `convertConferenceToAi`
**Purpose:** Switches an existing scheduled Conference from human to AI mode without changing the URL.
**Input:** `{ roomName }`
**Logic:**
1. Find Conference by `room_name`
2. Reject if `status === "completed"` or `"cancelled"`
3. Update `interview_mode: "ai"`
**Output:** `{ status: "success", conferenceId, interviewMode: "ai" }`

### 6.7 `ensureTwilioRecordingRoom`
**Purpose:** Creates a Twilio Video room with server-side recording BEFORE anyone joins (human mode).
**Input:** `{ roomName }`
**Logic:**
1. Call `createRecordingRoom(roomName)` — creates room with `recordParticipantsOnConnect: true` + status callback
2. If room created, save `twilio_room_sid` to Conference (if one exists)
3. If room already exists (error), return success with `created: false` (not an error — room may already have recording)
**Output:** `{ status: "success", roomSid?, created }`

### 6.8 `twilioRecordingCallback`
**Purpose:** Webhook handler for Twilio room + composition status callbacks. Receives form-encoded POST.
**Input:** `URLSearchParams` body with `StatusCallbackEvent`, `RoomSid`, `RoomName`, `CompositionSid`
**Logic:**
1. Parse form-encoded body
2. `room-ended` → call `createComposition(roomSid)`, save `twilio_room_sid` + `twilio_composition_sid` to Conference
3. `composition-available` → extract `MediaUri` (or fetch via `getCompositionMediaUrl`), save `twilio_composition_sid` + `twilio_composition_url` to Conference, push `twilio_backup_recording` doc to HireCandidate
4. Other events → acknowledge
**Output:** `{ status: "success", action }`

---

## 7. Frontend Components

### 7.1 `src/pages/Conference.jsx`
**Purpose:** Entry point for all interviews. Reads `room` from URL, determines mode, renders the right panel.
**Logic:**
1. Get `room` from URL params
2. Query `Conference.filter({ room_name: room })` to get `interview_mode`
3. If `interview_mode === "ai"` → set state to "ai"
4. If `interview_mode === "human"` (or default) → call `base44.functions.invoke("ensureTwilioRecordingRoom", { roomName: room })` to pre-create the Twilio room with recording
5. Check auth via `base44.auth.isAuthenticated()` + `base44.auth.me()`
6. Render:
   - AI mode → `<TavusInterviewPanel roomName={roomName} currentUserName={user?.full_name} recipientName="Arriv Interview" onClose={() => window.history.back()} />`
   - Human mode → `<VideoCallPanelV2 roomName={roomName} currentUserId={...} currentUserName={...} recipientName="Conference" onClose={...} autoStart={autoStart} isVideoWindowOpen={true} />`

### 7.2 `src/components/interviews/TavusInterviewPanel.jsx`
**Purpose:** AI interview UI shell using Daily.co SDK. Visually replicates VideoCallPanelV2.
**Key behaviors:**
1. **Camera init:** `getUserMedia({ video: { width: 1280, height: 720 }, audio: true })` on mount
2. **Pre-call recording notice:** Full-screen overlay with "This interview will be recorded" + "I Understand — Continue" button. Join button is disabled until dismissed.
3. **Start call:** `base44.functions.invoke("createTavusInterviewConversation", { roomName })` → `DailyIframe.createCallObject()` → `call.join({ url: conversationUrl, token: meetingToken, userName })`
4. **Remote video:** On `participant-joined`/`participant-updated`, find non-local participant, attach `videoTrack` to `<video>` element
5. **Auto-start recording:** When remote video first arrives AND `callState === "connected"`, start MediaRecorder:
   - Tracks: remote video track + mixed audio (remote audio + local audio via `AudioContext` + `MediaStreamDestination`)
   - MIME: `video/webm;codecs=vp8,opus` (fallback `video/webm`)
   - `recorder.start(1000)` — collect chunks every 1 second
6. **Recording indicator:** Red pulsing dot + `REC MM:SS` timer, top-left, always visible during recording
7. **Stop recording:** On end call or unmount, `recorder.stop()` → `onstop` handler:
   - Create `Blob` from chunks
   - If `blob.size > 50MB`, skip cloud upload (too large)
   - Upload via `base44.integrations.Core.UploadFile({ file })` with 60s timeout
   - Call `base44.functions.invoke("saveInterviewRecording", { roomName, recordingUrl: file_url, durationSeconds, fileSize })`
8. **End call:** Stop recording → wait 300ms → `call.leave()` + `call.destroy()` → stop local tracks → `base44.functions.invoke("endTavusInterview", { roomName })` → `onClose()`
9. **Mic/Video toggles:** Toggle local track `enabled` + `call.setLocalAudio/setLocalVideo`
10. **Controls:** Uses shared `VideoControls` component (same as VideoCallPanelV2)

### 7.3 `src/components/admin/InterviewSchedulerModal.jsx`
**Purpose:** Admin UI for scheduling interviews with conflict detection + AI mode toggle.
**Key behaviors:**
1. Load organizer from `localStorage` (sales session) or `base44.auth.me()`
2. Load all `Conference` records with `status: "scheduled"` for live conflict detection
3. Live conflict check: compute UTC start/end for requested slot, compare against all existing
4. **AI Interviewer checkbox:** Gold-accented checkbox with Brain icon. When checked, passes `interviewMode: "ai"` to `scheduleConference`
5. Default time: `16:30` ET, default duration: 30 min
6. On submit: call `scheduleConference`, show toast, close modal

### 7.4 `src/components/interviews/ConvertToAiButton.jsx`
**Purpose:** Admin action to convert a scheduled human interview to AI mode.
**Key behaviors:**
1. If `interview_mode === "ai"` → show gold "AI Interviewer" badge
2. If `status === "completed"` or `"cancelled"` → render null
3. On click: confirm dialog → `base44.functions.invoke("convertConferenceToAi", { roomName })` → toast success

---

## 8. Webhook Registration

### 8.1 Tavus Webhook
- **URL:** `${BASE44_APP_DOMAIN}/functions/tavusInterviewCallback`
- **Method:** POST
- **Registered automatically** as the `callback_url` on every Tavus conversation created via `createTavusConversation`
- **No manual registration needed** — the callback URL is sent in the conversation creation request body

### 8.2 Twilio Webhook
- **URL:** `${BASE44_APP_DOMAIN}/functions/twilioRecordingCallback`
- **Method:** POST
- **Registered automatically** as the `statusCallback` on every Twilio room created via `createRecordingRoom` and every composition created via `createComposition`
- **No manual registration needed** in the Twilio console — the callback URL is sent per-room and per-composition

---

## 9. Complete Data Flow — AI Interview

```
1. Admin opens InterviewSchedulerModal, checks "Use AI Interviewer", picks date/time
   → scheduleConference({ interviewMode: "ai", ... })
   → Conference created with interview_mode: "ai", meeting_link: "/Conference?room=..."
   → Google Calendar invite sent to applicant
   → Confirmation email sent to applicant + admin CC

2. Applicant opens meeting_link at scheduled time
   → Conference.jsx loads, reads interview_mode: "ai"
   → Renders TavusInterviewPanel
   → Pre-call recording notice shown ("This interview will be recorded")

3. Applicant clicks "I Understand — Continue", then "Join Call"
   → createTavusInterviewConversation({ roomName })
   → createTavusConversation({ requireAuth: true, auto_start_recording: true })
   → Tavus creates conversation, returns conversation_url + meeting_token
   → Conference updated: tavus_conversation_id, tavus_started_at, tavus_meeting_token
   → DailyIframe.createCallObject().join({ url, token })

4. AI replica joins the conversation
   → Tavus fires system.pal_joined → tavusInterviewCallback → tavus_conversation_status: "active"
   → Tavus auto-starts server-side recording (auto_start_recording: true)

5. Remote video arrives in Daily SDK
   → TavusInterviewPanel auto-starts local MediaRecorder (remote video + mixed audio)
   → Red recording indicator + timer shown

6. Interview proceeds — AI asks Round 1 questions, candidate answers

7. Applicant clicks End Call
   → MediaRecorder.stop() → upload to UploadFile → saveInterviewRecording
     → Conference.recording_url set, recording_status: "ready"
     → VideoRecording record created
     → HireCandidate.documents gets { type: "interview_recording", url }
   → Daily call.leave() + destroy()
   → endTavusInterview → endTavusConversation → Conference.status: "completed"

8. Tavus processes recording (server-side)
   → Fires application.recording_ready → tavusInterviewCallback
   → Conference.tavus_recording_storage_uri set (backup recording)

9. Tavus processes transcript
   → Fires application.transcription_ready → tavusInterviewCallback
   → parseTranscriptToScorecard (InvokeLLM maps transcript to 19 Round 1 questions)
   → TavusInterviewTranscript record created (full transcript + parsed scorecard)
   → If confidence >= 0.6 AND all answered:
     → Conference.round1_scorecard set, tavus_scorecard_saved: true
     → HireCandidate.round1_scorecard set, status: "interviewing"
   → If confidence < 0.6 OR incomplete:
     → Conference.tavus_review_required: true (admin must review)
```

---

## 10. Complete Data Flow — Human Interview

```
1. Admin opens InterviewSchedulerModal, leaves "Use AI Interviewer" unchecked
   → scheduleConference({ interviewMode: "human", ... })
   → Conference created with interview_mode: "human"
   → Google Calendar invite + confirmation email sent

2. Applicant OR admin opens meeting_link at scheduled time
   → Conference.jsx loads, reads interview_mode: "human"
   → Calls ensureTwilioRecordingRoom({ roomName })
     → createRecordingRoom({ recordParticipantsOnConnect: true, statusCallback })
     → Twilio room created with server-side recording enabled
     → Conference.twilio_room_sid saved
   → Renders VideoCallPanelV2 (existing Twilio Video panel)

3. Participants join via Twilio Video tokens
   → Twilio automatically records each participant (RecordParticipantsOnConnect: true)
   → VideoCallPanelV2 also runs local MediaRecorder (existing behavior)

4. Interview proceeds with human interviewer

5. Call ends — all participants leave
   → Twilio room transitions to "completed"
   → Local MediaRecorder upload → saveInterviewRecording (same as AI mode)
   → Twilio fires room-ended → twilioRecordingCallback
     → createComposition(roomSid) — combines individual recordings into single MP4
     → Conference.twilio_composition_sid saved

6. Twilio processes composition
   → Fires composition-available → twilioRecordingCallback
   → Conference.twilio_composition_url saved (backup recording)
   → HireCandidate.documents gets { type: "twilio_backup_recording", url, composition_sid }
```

---

## 11. Recording Strategy Summary

| Layer | AI Mode | Human Mode |
|-------|---------|------------|
| **Primary** | Local MediaRecorder → UploadFile → `saveInterviewRecording` → Conference.recording_url + HireCandidate.documents | Same (existing VideoCallPanelV2 behavior) |
| **Backup (server-side)** | Tavus `auto_start_recording: true` → `recording_ready` webhook → Conference.tavus_recording_storage_uri | Twilio `RecordParticipantsOnConnect: true` → `room-ended` → Composition → `composition-available` → Conference.twilio_composition_url + HireCandidate.documents |
| **Disclosure** | Pre-call overlay: "This interview will be recorded" + "I Understand" button (required before join) | (Existing VideoCallPanelV2 behavior) |
| **Indicator** | Red pulsing dot + REC timer (always visible) | (Existing VideoCallPanelV2 behavior) |

---

## 12. Step-by-Step Replication Checklist

### Entities
- [ ] Add `interview_mode`, `tavus_*`, `recording_*`, `twilio_*` fields to Conference entity (see §2.1)
- [ ] Create `TavusInterviewTranscript` entity (see §2.2)
- [ ] Confirm `HireCandidate.documents` is an array of objects (no schema change)
- [ ] Confirm `VideoRecording` entity exists

### Secrets
- [ ] Set `TAVUS_API_KEY`
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`
- [ ] Set `BASE44_APP_DOMAIN`

### NPM Packages
- [ ] Install `@daily-co/daily-js` (^0.79.0)

### Shared Modules
- [ ] Create `base44/shared/tavusInterview.ts` (see §5.1 — copy exactly, including `TAVUS_PAL_ID`)
- [ ] Create `base44/shared/twilioRecording.ts` (see §5.2)

### Backend Functions
- [ ] `scheduleConference` — add `interviewMode` param, pass to Conference.create (see §6.1)
- [ ] `createTavusInterviewConversation` (see §6.2)
- [ ] `endTavusInterview` (see §6.3)
- [ ] `tavusInterviewCallback` (see §6.4)
- [ ] `saveInterviewRecording` (see §6.5)
- [ ] `convertConferenceToAi` (see §6.6)
- [ ] `ensureTwilioRecordingRoom` (see §6.7)
- [ ] `twilioRecordingCallback` (see §6.8)

### Frontend
- [ ] `src/pages/Conference.jsx` — mode-based routing + ensureTwilioRecordingRoom call (see §7.1)
- [ ] `src/components/interviews/TavusInterviewPanel.jsx` — Daily.co SDK shell with recording (see §7.2)
- [ ] `src/components/admin/InterviewSchedulerModal.jsx` — add AI interviewer checkbox (see §7.3)
- [ ] `src/components/interviews/ConvertToAiButton.jsx` — admin conversion control (see §7.4)

### Tavus Dashboard
- [ ] Create a PAL with the Arriv Round 1 interview questionnaire
- [ ] Note the PAL ID and set it as `TAVUS_PAL_ID` in `tavusInterview.ts`

### Testing
- [ ] Schedule a human interview → verify Twilio room created with recording
- [ ] Schedule an AI interview → verify Tavus conversation created
- [ ] Join AI interview → verify Daily.co connection + local recording + recording indicator
- [ ] End AI interview → verify recording upload + Tavus end
- [ ] Wait for Tavus transcript → verify scorecard parsing + HireCandidate update
- [ ] Join human interview → verify Twilio recording
- [ ] End human interview → verify composition creation + composition-available webhook
- [ ] Test ConvertToAiButton on a scheduled human interview → verify mode switch without URL change
- [ ] Test conflict detection → verify double-booking prevention

---

## 13. Key Implementation Notes

1. **Tavus PAL ID** (`p5f532a78213`) is specific to the Arriv Estate Media Tavus account. Arriv One must create its own PAL in the Tavus dashboard and update the constant.

2. **`require_auth: true`** on Tavus conversations means a `meeting_token` is required to join. The token is saved on the Conference as `tavus_meeting_token` and passed to the Daily SDK `join()` call.

3. **Twilio room creation timing:** The room must be created with `RecordParticipantsOnConnect: true` BEFORE anyone joins. `ensureTwilioRecordingRoom` is called from `Conference.jsx` on page load (before the video panel connects). If the room is created implicitly by Twilio when someone joins (without our explicit create call), recording will NOT be enabled.

4. **Twilio Composition** combines individual participant recordings into a single MP4. The composition is created when the `room-ended` webhook fires. The `composition-available` webhook fires when the composition is ready (can take minutes).

5. **Scorecard parsing** uses `InvokeLLM` with a JSON schema. The LLM maps transcript utterances to the 19 Round 1 questions. Only `role: "user"` utterances (candidate's words) are used. `review_required` is set if average confidence < 0.6 or not all questions were answered.

6. **Recording upload size limit:** Local recordings > 50MB are skipped (cloud upload would time out). The 60-second upload timeout is enforced via a Promise wrapper.

7. **Conflict detection** uses UTC timestamps computed from the ET input. The conversion uses `Intl.DateTimeFormat` with `America/New_York` to calculate the offset, then applies it to get the correct UTC time (handles DST correctly).

8. **Mode switching** (`convertConferenceToAi`) does NOT change the room name or meeting link. The same `/Conference?room=...` URL will automatically render the Tavus panel the next time it is opened, because `Conference.jsx` reads `interview_mode` from the database.

9. **No Tavus iframe.** The Daily.co JS SDK is used to join the Tavus conversation and render participant streams within our own UI. This ensures pixel-perfect visual parity with VideoCallPanelV2 — no Tavus branding is visible to the candidate.

10. **Dual audio mixing.** The local MediaRecorder mixes remote audio + local audio via `AudioContext` + `MediaStreamDestination` so the recording captures both sides of the conversation.