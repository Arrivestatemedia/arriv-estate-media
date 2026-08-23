import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const SupportContext = createContext(null);
export const useSupport = () => useContext(SupportContext);

// Safe page-context derivation from the current route.
// Adjust the routes to match your application's pages.
function derivePageContext(location) {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  let record_type = null;
  let record_id = null;
  if (path.startsWith("/ContactDetailPage")) { record_type = "Contact"; record_id = params.get("id"); }
  else if (path.startsWith("/TenantCommandCenter")) { record_type = "Tenant"; record_id = params.get("tenant_id"); }
  else if (path.startsWith("/AdminSyncStatus")) { record_type = "SyncStatus"; }
  else if (path.startsWith("/PlatformDashboard")) { record_type = "PlatformDashboard"; }
  else if (path.startsWith("/AdminCompanies")) { record_type = "TenantList"; }
  const viewAs = sessionStorage.getItem("view_as_tenant_id") || localStorage.getItem("view_as_tenant_id") || null;
  return {
    route: path,
    record_type,
    record_id,
    feature: params.get("view") || null,
    view_as_tenant_id: viewAs,
  };
}

// Certified platform defaults for typing indicator visibility.
const TYPING_MIN_VISIBLE_MS_DEFAULT = 1500;
const TYPING_MAX_VISIBLE_MS_DEFAULT = 10000;

// Normalize content for dedup fallback: trim + collapse whitespace so minor
// formatting differences between sendMessage and getConversation don't defeat dedup.
function normalizeContent(s) {
  if (!s) return "";
  return String(s).trim().replace(/\s+/g, " ");
}

// Normalize role for dedup fallback: map all agent/assistant/bot/AI variants to
// "agent" so the same canonical message deduplicates regardless of sender_type label.
function normalizeRole(r) {
  if (!r) return "agent";
  const lower = String(r).toLowerCase();
  if (lower === "user") return "user";
  if (lower === "system") return "system";
  return "agent";
}

// Canonical message sort key — determines the correct chronological position of
// each message in the rendered timeline, independent of network arrival order.
// Priority order:
//   1. canonical sequence/order field
//   2. canonical created_at/timestamp
//   3. assignment/transfer revision (lower revision first)
//   4. deterministic event precedence (JOIN_EVENT < AGENT_RESPONSE for same revision)
//   5. stable prior order (final fallback)
function messageSortKey(m, fallbackAssignmentRevision) {
  // Optimistic customer messages (synthetic ID prefix "user-") ALWAYS sort last.
  // This guarantees customer messages appear below all existing messages — no
  // exceptions, no timing issues. When the canonical version arrives (with a real
  // ID and sequence), mergeMessages upgrades it and it sorts correctly.
  if (m.id && String(m.id).startsWith("user-")) {
    return { seq: Number.MAX_SAFE_INTEGER, ts: Number.MAX_SAFE_INTEGER, msgRev: Number.MAX_SAFE_INTEGER, eventPrecedence: 1 };
  }
  const seq = m.sequence ?? m.seq;
  const ts = m.created_date ? new Date(m.created_date).getTime() : 0;
  const msgRev = m.assignment_revision ?? fallbackAssignmentRevision ?? 0;
  const isJoinEvent = m.role === "system" ||
    (m.event_type && ["AGENT_JOINED", "SYSTEM", "EVENT"].includes(String(m.event_type).toUpperCase()));
  const eventPrecedence = isJoinEvent ? 0 : 1;
  return { seq, ts, msgRev, eventPrecedence };
}

// Sort messages into canonical chronological order using a stable sort.
function sortMessages(messages, fallbackAssignmentRevision) {
  return messages
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ka = messageSortKey(a.m, fallbackAssignmentRevision);
      const kb = messageSortKey(b.m, fallbackAssignmentRevision);
      // 1. canonical sequence (if both have it)
      if (ka.seq != null && kb.seq != null) {
        const cmp = Number(ka.seq) - Number(kb.seq);
        if (cmp !== 0) return cmp;
      }
      // 2. timestamp
      if (ka.ts !== kb.ts) return ka.ts - kb.ts;
      // 3. assignment revision (lower first)
      const revCmp = Number(ka.msgRev) - Number(kb.msgRev);
      if (revCmp !== 0) return revCmp;
      // 4. event precedence (join before response)
      if (ka.eventPrecedence !== kb.eventPrecedence) return ka.eventPrecedence - kb.eventPrecedence;
      // 5. stable prior order
      return a.i - b.i;
    })
    .map((x) => x.m);
}

// Merge message arrays by canonical ID (primary) and normalized role+content
// (secondary fallback). Deduplicates agent messages, manager join events, transfer
// acknowledgments, and customer messages across ALL ingestion paths.
// Handles the case where sendMessage returns a synthetic ID but checkConversationStatus
// later returns the same message with a canonical ID.
// Preserves historical sender identity (never overwrites role/content of existing).
// After merging, sorts into canonical chronological order so late-arriving events
// (e.g. AGENT_JOINED arriving after the agent's first response) are placed in their
// correct timeline position rather than appended at the bottom.
function mergeMessages(existing, incoming, fallbackAssignmentRevision) {
  if (!incoming || incoming.length === 0) return existing;
  const byId = new Map();
  const contentKeyToId = new Map();
  const ordered = [];
  for (const m of existing) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      ordered.push(m.id);
      const ck = `${normalizeRole(m.role)}:${normalizeContent(m.content)}`;
      if (!contentKeyToId.has(ck)) contentKeyToId.set(ck, m.id);
    }
  }
  for (const m of incoming) {
    if (!m || !m.id) continue;
    const contentKey = `${normalizeRole(m.role)}:${normalizeContent(m.content)}`;
    // Skip if same canonical ID already exists
    if (byId.has(m.id)) continue;
    // If same content exists, upgrade optimistic (no sequence) to canonical (has sequence).
    // This reconciles locally-rendered optimistic customer messages with their canonical
    // counterparts when they arrive via poll — the canonical version (with sequence)
    // replaces the synthetic one so sortMessages can order it correctly.
    if (contentKeyToId.has(contentKey)) {
      const existingId = contentKeyToId.get(contentKey);
      const existingMsg = byId.get(existingId);
      if (existingMsg.sequence == null && m.sequence != null) {
        byId.delete(existingId);
        byId.set(m.id, m);
        const idx = ordered.indexOf(existingId);
        ordered[idx] = m.id;
        contentKeyToId.set(contentKey, m.id);
      }
      continue;
    }
    byId.set(m.id, m);
    ordered.push(m.id);
    contentKeyToId.set(contentKey, m.id);
  }
  const merged = ordered.map((id) => byId.get(id));
  return sortMessages(merged, fallbackAssignmentRevision);
}

// Transfer state precedence — monotonically increasing.
// Once a conversation reaches COMPLETED, it may NOT regress to a lower state
// for the same transfer lifecycle (unless a strictly newer revision arrives).
const TRANSFER_STATE_PRECEDENCE = {
  NONE: 0,
  REQUESTED: 1,
  TRANSFERRING: 2,
  WITH_MANAGER: 3,
  COMPLETED: 4,
};

function transferPrecedence(state) {
  if (!state) return 0;
  return TRANSFER_STATE_PRECEDENCE[String(state).toUpperCase().trim()] ?? 0;
}

// Detect if an agent is a manager based on canonical agent_title/role.
// Arriv Assist maps agent_role → agent_title in the response. If the title
// contains "manager" (case-insensitive), the agent is a support manager.
function isManagerAgent(agentTitle) {
  if (!agentTitle) return false;
  return /manager/i.test(String(agentTitle));
}

// Check if any agent message in the message list belongs to the current
// (latest) assignment — i.e. the manager has already spoken. This is strong
// canonical evidence that the transfer is functionally complete.
function hasAgentMessageForCurrentAgent(messages, currentAgentId) {
  if (!messages || messages.length === 0) return false;
  if (!currentAgentId) return false;
  return messages.some((m) =>
    m.role === "agent" &&
    (m.agent_id === currentAgentId || !m.agent_id) // agent message without explicit agent_id counts too
  );
}

export default function SupportProvider({ children }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [agentTyping, setAgentTyping] = useState(false); // driven by canonical state
  const [transferState, setTransferState] = useState(null); // canonical transfer state
  const [transferStateRevision, setTransferStateRevision] = useState(null); // monotonic revision guard for transfer state
  const [assignmentRevision, setAssignmentRevision] = useState(null);
  // Refs mirror state for stale-async-closure protection — always hold the latest
  // value so async callbacks (polls, delayed merges) compare against current truth,
  // not a stale closure capture from when the callback was created.
  const transferStateRef = useRef(null);
  const transferStateRevisionRef = useRef(null);
  const assignmentRevisionRef = useRef(null);
  // Closed-state refs for stale-async protection. Once a conversation is CLOSED,
  // stale polls/sendMessage/typing/transfer callbacks for that conversation must
  // NOT reopen it. CLOSED is terminal for the conversation lifecycle.
  const closedRef = useRef(false);
  const closedConversationIdRef = useRef(null);
  const transcriptUrlRef = useRef(null);
  const resetScheduledRef = useRef(false);
  const [typingConfig, setTypingConfig] = useState({
    enabled: true,
    minVisibleMs: TYPING_MIN_VISIBLE_MS_DEFAULT,
    maxVisibleMs: TYPING_MAX_VISIBLE_MS_DEFAULT,
  });
  const [closed, setClosed] = useState(false);
  const [closureReason, setClosureReason] = useState(null);
  const [transcriptUrl, setTranscriptUrl] = useState(null);
  const [transcriptStatus, setTranscriptStatus] = useState(null);
  const [transcriptOffered, setTranscriptOffered] = useState(false);
  const [transcriptRequested, setTranscriptRequested] = useState(false);
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  // Customer context — unified canonical context from Arriv Assist.
  // Both regular agents and managers consume the SAME customerContext.
  // Customer identity persists through agent assignment changes (transfer).
  const [customerContext, setCustomerContext] = useState(null);
  const customerContextRef = useRef(null);
  const pageContextRef = useRef(derivePageContext(location));

  // Typing timer management refs
  const typingStartRef = useRef(null); // when canonical typing started (ms)
  const typingMinTimerRef = useRef(null); // min visible duration timer
  const typingMaxTimerRef = useRef(null); // stale typing guard timer
  const canonicalTypingRef = useRef(false); // latest canonical typing state

  useEffect(() => {
    pageContextRef.current = derivePageContext(location);
  }, [location]);

  const getActor = useCallback(() => {
    const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
    const viewAs = sessionStorage.getItem("view_as_tenant_id") || localStorage.getItem("view_as_tenant_id") || null;
    return { sales_member_id: salesMemberId || undefined, view_as_tenant_id: viewAs || undefined };
  }, []);

  // Resolve typing config from canonical response data, falling back to certified defaults.
  const resolveTypingConfig = useCallback((data) => {
    const enabled = data?.typing_indicator_enabled ?? true;
    const minMs = data?.typing_indicator_min_visible_ms ?? TYPING_MIN_VISIBLE_MS_DEFAULT;
    const maxMs = data?.typing_indicator_max_visible_ms ?? TYPING_MAX_VISIBLE_MS_DEFAULT;
    return { enabled, minVisibleMs: minMs, maxVisibleMs: maxMs };
  }, []);

  // Clear all typing timers — called on reset, close, or stale guard trigger.
  const clearTypingTimers = useCallback(() => {
    if (typingMinTimerRef.current) { clearTimeout(typingMinTimerRef.current); typingMinTimerRef.current = null; }
    if (typingMaxTimerRef.current) { clearTimeout(typingMaxTimerRef.current); typingMaxTimerRef.current = null; }
  }, []);

  // Apply canonical typing state with min/max visible duration enforcement.
  // Does NOT fabricate typing — only shows indicator when canonical agent_typing is true.
  const applyCanonicalTyping = useCallback((canonicalTyping, cfg) => {
    const config = cfg || typingConfig;
    if (!config.enabled) {
      clearTypingTimers();
      setAgentTyping(false);
      canonicalTypingRef.current = false;
      return;
    }
    canonicalTypingRef.current = !!canonicalTyping;

    if (canonicalTyping) {
      // Canonical typing started — show indicator, start min/max timers
      if (!typingStartRef.current) {
        typingStartRef.current = Date.now();
        setAgentTyping(true);
      }
      // Stale typing guard — clear after max visible duration without canonical update
      if (typingMaxTimerRef.current) clearTimeout(typingMaxTimerRef.current);
      typingMaxTimerRef.current = setTimeout(() => {
        setAgentTyping(false);
        typingStartRef.current = null;
        canonicalTypingRef.current = false;
      }, config.maxVisibleMs);
    } else {
      // Canonical typing ended — keep visible until min duration completes
      if (typingStartRef.current) {
        const elapsed = Date.now() - typingStartRef.current;
        const remaining = Math.max(0, config.minVisibleMs - elapsed);
        if (remaining > 0) {
          if (typingMinTimerRef.current) clearTimeout(typingMinTimerRef.current);
          typingMinTimerRef.current = setTimeout(() => {
            setAgentTyping(false);
            typingStartRef.current = null;
          }, remaining);
        } else {
          setAgentTyping(false);
          typingStartRef.current = null;
        }
      } else {
        setAgentTyping(false);
      }
      if (typingMaxTimerRef.current) { clearTimeout(typingMaxTimerRef.current); typingMaxTimerRef.current = null; }
    }
  }, [typingConfig, clearTypingTimers]);

  // Sync transcript state from canonical data. NOT blocked by closedRef —
  // transcript updates must arrive even after CLOSED so a pending transcript
  // can resolve to a download URL. This is the ONLY state allowed to update
  // after closure; all other state (agent, transfer, typing, messages) is blocked.
  const syncTranscriptState = useCallback((data) => {
    if (!data) return;
    let changed = false;
    if (data.transcript_url && data.transcript_url !== transcriptUrlRef.current) {
      transcriptUrlRef.current = data.transcript_url;
      setTranscriptUrl(data.transcript_url);
      changed = true;
    }
    if (data.transcript_offered !== undefined) {
      setTranscriptOffered(!!data.transcript_offered);
    }
    if (data.transcript_requested !== undefined) {
      setTranscriptRequested(!!data.transcript_requested);
    }
    if (data.transcript_ready !== undefined) {
      setTranscriptReady(!!data.transcript_ready);
    }
    if (data.transcript_status !== undefined && data.transcript_status !== null) {
      setTranscriptStatus(data.transcript_status);
    }
    return changed;
  }, []);

  // Sync canonical state from any Assist response (sendMessage, checkConversationStatus, getActiveConversation).
  // Compares assignment revision, updates agent, transfer state, typing, and messages.
  // Also extracts customer_preferred_name and customer_issue_summary.
  const syncCanonicalState = useCallback((data) => {
    if (!data) return;

    // Transcript state is ALWAYS synced — even after CLOSED, a pending transcript
    // must resolve to a download URL. This runs BEFORE the closedRef guard.
    const transcriptChanged = syncTranscriptState(data);

    // Customer context fields — ALWAYS synced (persist through transfer, refresh, close).
    // Uses canonical field names from Assist. Both regular agents and managers
    // consume the SAME customerContext — agent identity changes on transfer,
    // customer identity does NOT.
    const newCtx = { ...(customerContextRef.current || {}) };
    let ctxChanged = false;
    if (data.customer_first_name !== undefined && data.customer_first_name !== null) {
      newCtx.first_name = data.customer_first_name; ctxChanged = true;
    }
    if (data.customer_last_name !== undefined && data.customer_last_name !== null) {
      newCtx.last_name = data.customer_last_name; ctxChanged = true;
    }
    if (data.customer_full_name !== undefined && data.customer_full_name !== null) {
      newCtx.full_name = data.customer_full_name; ctxChanged = true;
    }
    if (data.customer_preferred_name !== undefined && data.customer_preferred_name !== null) {
      newCtx.preferred_name = data.customer_preferred_name; ctxChanged = true;
    }
    if (data.customer_name_complete !== undefined && data.customer_name_complete !== null) {
      newCtx.name_complete = !!data.customer_name_complete; ctxChanged = true;
    }
    if (data.name_formality_preference !== undefined && data.name_formality_preference !== null) {
      newCtx.formality_preference = data.name_formality_preference; ctxChanged = true;
    }
    const issueSummary = data.conversation_issue_summary ?? data.customer_issue_summary;
    if (issueSummary !== undefined && issueSummary !== null) {
      newCtx.issue_summary = issueSummary; ctxChanged = true;
    }
    // Contact / phone / SMS fields — consumed, never fabricated
    if (data.customer_phone !== undefined && data.customer_phone !== null) {
      newCtx.phone = data.customer_phone; ctxChanged = true;
    }
    if (data.customer_phone_normalized !== undefined && data.customer_phone_normalized !== null) {
      newCtx.phone_normalized = data.customer_phone_normalized; ctxChanged = true;
    }
    if (data.customer_phone_verified !== undefined && data.customer_phone_verified !== null) {
      newCtx.phone_verified = !!data.customer_phone_verified; ctxChanged = true;
    }
    if (data.customer_phone_source !== undefined && data.customer_phone_source !== null) {
      newCtx.phone_source = data.customer_phone_source; ctxChanged = true;
    }
    if (data.sms_notification_requested !== undefined) {
      newCtx.sms_requested = !!data.sms_notification_requested; ctxChanged = true;
    }
    if (data.sms_notification_ready !== undefined) {
      newCtx.sms_ready = !!data.sms_notification_ready; ctxChanged = true;
    }
    if (data.sms_notification_status !== undefined && data.sms_notification_status !== null) {
      newCtx.sms_status = data.sms_notification_status; ctxChanged = true;
    }
    if (data.ticket_created !== undefined) {
      newCtx.ticket_created = !!data.ticket_created; ctxChanged = true;
    }
    if (ctxChanged) {
      customerContextRef.current = newCtx;
      setCustomerContext(newCtx);
    }

    // If transcript URL just arrived after closure, schedule the reset (with download delay).
    if (transcriptChanged && transcriptUrlRef.current && closedRef.current && !resetScheduledRef.current) {
      resetScheduledRef.current = true;
      setTimeout(() => resetConversation(), 10000);
    }

    // CLOSED is terminal — stale async responses must NOT reopen a closed conversation.
    // This guard blocks stale polls, delayed submitIssue callbacks, typing responses,
    // and transfer updates that arrive after canonical closure.
    if (closedRef.current) return;

    // Update typing config if provided
    if (data.typing_indicator_enabled !== undefined || data.typing_indicator_min_visible_ms !== undefined) {
      setTypingConfig(resolveTypingConfig(data));
    }

    // Assignment revision check — update agent if revision is newer.
    // Uses ref for stale-async-closure protection.
    const canonicalRevision = data.agent_assignment_revision ?? null;
    const revisionChanged = canonicalRevision !== null && canonicalRevision !== assignmentRevisionRef.current;
    if (revisionChanged) {
      assignmentRevisionRef.current = canonicalRevision;
      setAssignmentRevision(canonicalRevision);
    }

    // Update current agent from canonical data (if provided and changed)
    if (data.support_agent_id || data.agent_name) {
      setConversation((prev) => {
        if (!prev) return prev;
        const canonicalAgentId = data.support_agent_id || prev.support_agent_id;
        const canonicalAgentName = data.agent_name || prev.agent_name;
        const canonicalAgentTitle = data.agent_title || prev.agent_title;
        const canonicalAvatar = data.agent_avatar_initial || (canonicalAgentName ? canonicalAgentName.charAt(0).toUpperCase() : prev.agent_avatar_initial);
        const canonicalAvatarUrl = data.agent_avatar_url !== undefined ? data.agent_avatar_url : prev.agent_avatar_url;
        // Only update if something changed
        if (canonicalAgentId === prev.support_agent_id && canonicalAgentName === prev.agent_name && !revisionChanged) {
          return prev;
        }
        return {
          ...prev,
          support_agent_id: canonicalAgentId,
          agent_name: canonicalAgentName,
          agent_title: canonicalAgentTitle,
          agent_avatar_initial: canonicalAvatar,
          agent_avatar_url: canonicalAvatarUrl,
        };
      });
    }

    // Transfer state — canonical monotonic state machine.
    // Uses BOTH revision + state precedence to prevent regression.
    // Missing transfer_state in the payload = NOOP (do not default to NONE).
    const incomingTransferState = data.transfer_state;
    if (incomingTransferState !== undefined && incomingTransferState !== null && incomingTransferState !== "") {
      const incomingTransferRevision = data.state_revision ?? data.agent_assignment_revision ?? null;
      const currentState = transferStateRef.current;
      const currentRev = transferStateRevisionRef.current;
      const incomingPrec = transferPrecedence(incomingTransferState);
      const currentPrec = transferPrecedence(currentState);

      let accept = false;
      let reason = "";

      if (incomingTransferRevision === null) {
        // Unversioned payload — do NOT allow regression of a known later state.
        // Safe rule: accept only if incoming precedence >= current precedence.
        if (incomingPrec >= currentPrec) {
          accept = true;
          reason = "ACCEPT_UNVERSIONED_FORWARD";
        } else {
          accept = false;
          reason = "REJECT_UNVERSIONED_REGRESSION";
        }
      } else if (currentRev === null) {
        // No current revision — accept (first versioned payload)
        accept = true;
        reason = "ACCEPT_NO_CURRENT_REVISION";
      } else {
        const cmp = Number(incomingTransferRevision) - Number(currentRev);
        if (cmp > 0) {
          // A. incoming revision > current → accept (new lifecycle or forward update)
          accept = true;
          reason = "ACCEPT_NEWER_REVISION";
        } else if (cmp === 0) {
          // B. incoming revision == current → accept ONLY if precedence >= current
          if (incomingPrec >= currentPrec) {
            accept = true;
            reason = "ACCEPT_EQUAL_REVISION_FORWARD";
          } else {
            accept = false;
            reason = "REJECT_EQUAL_REVISION_STATE_REGRESSION";
          }
        } else {
          // C. incoming revision < current → reject (stale)
          accept = false;
          reason = "REJECT_STALE_REVISION";
        }
      }

      if (accept) {
        transferStateRef.current = incomingTransferState;
        transferStateRevisionRef.current = incomingTransferRevision;
        setTransferState(incomingTransferState);
        setTransferStateRevision(incomingTransferRevision);
      }

      // Safe debug trace (no PII) — toggle via window.__ARRIV_TRANSFER_DEBUG
      if (typeof window !== "undefined" && window.__ARRIV_TRANSFER_DEBUG) {
        console.debug("[TransferState]", reason, {
          incoming_state: incomingTransferState,
          incoming_revision: incomingTransferRevision,
          current_state: currentState,
          current_revision: currentRev,
          accepted: accept,
        });
      }
    }
    // else: transfer_state missing/null/empty → NOOP, do not update transfer state

    // Typing state — canonical, with min/max visible duration
    applyCanonicalTyping(data.agent_typing ?? false, resolveTypingConfig(data));

    // Transcript lifecycle — canonical transcript state from Assist.
    if (data.transcript_url) {
      setTranscriptUrl(data.transcript_url);
    }
    if (data.transcript_offered !== undefined) {
      setTranscriptOffered(!!data.transcript_offered);
    }
    if (data.transcript_requested !== undefined) {
      setTranscriptRequested(!!data.transcript_requested);
    }
    if (data.transcript_ready !== undefined) {
      setTranscriptReady(!!data.transcript_ready);
    }
    if (data.transcript_status !== undefined && data.transcript_status !== null) {
      setTranscriptStatus(data.transcript_status);
    }

    // Merge messages by canonical ID (dedup) + canonical chronological sort.
    // Pass the current assignment revision as fallback so messages without
    // explicit sequence/timestamp are still ordered correctly relative to
    // their assignment group.
    const currentRevision = data.agent_assignment_revision ?? assignmentRevisionRef.current ?? null;
    if (data.messages && data.messages.length > 0) {
      setMessages((prev) => mergeMessages(prev, data.messages, currentRevision));
    } else if (data.message) {
      setMessages((prev) => mergeMessages(prev, [data.message], currentRevision));
    }

    // ACTIVE MANAGER DETECTION:
    // If the current canonical agent is a manager (agent_title contains "manager")
    // AND agent messages exist for the current assignment, the transfer is
    // functionally complete — force transfer_state to COMPLETED and hide the
    // connecting banner. This handles the race where a manager message arrives
    // before the transfer completion payload.
    // Uses only `data` (the current canonical response) — NOT `conversation` state —
    // to avoid stale closure issues when called from delayed setTimeout callbacks.
    const currentAgentTitle = data.agent_title;
    const currentAgentId = data.support_agent_id || data.current_agent_id;
    const allMessages = data.messages || (data.message ? [data.message] : []);
    if (isManagerAgent(currentAgentTitle) && hasAgentMessageForCurrentAgent(allMessages, currentAgentId)) {
      const currentTransferState = transferStateRef.current;
      const currentPrec = transferPrecedence(currentTransferState);
      const completedPrec = transferPrecedence("COMPLETED");
      // Only force COMPLETED if current state is lower (don't regress a known COMPLETED)
      if (currentPrec < completedPrec) {
        transferStateRef.current = "COMPLETED";
        transferStateRevisionRef.current = data.state_revision ?? data.agent_assignment_revision ?? transferStateRevisionRef.current;
        setTransferState("COMPLETED");
        setTransferStateRevision(transferStateRevisionRef.current);
      }
    }
  }, [applyCanonicalTyping, resolveTypingConfig]);

  // Reset all conversation state — returns widget to fresh intake
  const resetConversation = useCallback(() => {
    clearTypingTimers();
    typingStartRef.current = null;
    canonicalTypingRef.current = false;
    setConversation(null);
    setMessages([]);
    setAgentTyping(false);
    transferStateRef.current = null;
    transferStateRevisionRef.current = null;
    assignmentRevisionRef.current = null;
    closedRef.current = false;
    closedConversationIdRef.current = null;
    transcriptUrlRef.current = null;
    resetScheduledRef.current = false;
    setTransferState(null);
    setTransferStateRevision(null);
    setAssignmentRevision(null);
    setConnecting(false);
    setSending(false);
    setClosed(false);
    setClosureReason(null);
    setTranscriptUrl(null);
    setTranscriptStatus(null);
    setTranscriptOffered(false);
    setTranscriptRequested(false);
    setTranscriptReady(false);
    setTypingConfig({ enabled: true, minVisibleMs: TYPING_MIN_VISIBLE_MS_DEFAULT, maxVisibleMs: TYPING_MAX_VISIBLE_MS_DEFAULT });
    customerContextRef.current = null;
    setCustomerContext(null);
  }, [clearTypingTimers]);

  // Handle canonical CLOSED state from Assist — show completion, then reset.
  // Transcript state outranks reset: if transcript is requested but not yet
  // ready (pending), do NOT schedule a reset — keep the completion state
  // visible until the transcript URL arrives or generation fails.
  const handleClosed = useCallback((data) => {
    clearTypingTimers();
    typingStartRef.current = null;
    canonicalTypingRef.current = false;
    closedRef.current = true;
    if (conversation) {
      closedConversationIdRef.current = conversation.conversation_id;
    }
    setClosed(true);
    setClosureReason(data?.closure_reason || null);
    setTranscriptUrl(data?.transcript_url || null);
    transcriptUrlRef.current = data?.transcript_url || null;
    setTranscriptOffered(data?.transcript_offered ?? false);
    setTranscriptRequested(data?.transcript_requested ?? false);
    setTranscriptReady(data?.transcript_ready ?? false);
    setTranscriptStatus(data?.transcript_status || null);
    setSending(false);
    setAgentTyping(false);
    transferStateRef.current = null;
    transferStateRevisionRef.current = null;
    setTransferState(null);
    setTransferStateRevision(null);
    setConnecting(false);

    // Reset timing — transcript state outranks reset.
    // If transcript is requested but NOT ready and NO url yet → pending,
    // do NOT reset. Wait for the poll to deliver the URL or a failure.
    const isPending = (data?.transcript_requested || data?.transcript_status === "preparing")
      && !data?.transcript_url
      && data?.transcript_status !== "failed";
    if (isPending) {
      // Do NOT schedule reset — polling will deliver transcript_url or failure.
      // syncTranscriptState (called from poll via syncCanonicalState) will
      // schedule the reset when the URL arrives.
      return;
    }
    // If transcript URL is available, give the customer time to download.
    // Otherwise, standard completion delay.
    const delay = data?.transcript_url ? 10000 : 5000;
    resetScheduledRef.current = true;
    setTimeout(() => resetConversation(), delay);
  }, [resetConversation, clearTypingTimers, conversation]);

  // Check availability + restore existing conversation on open
  const startSupport = useCallback(async () => {
    setOpen(true);
    if (conversation) {
      // Reopening after minimize — refresh canonical state to discover
      // manager transfer, join, typing, or closure that happened while minimized.
      try {
        const actor = getActor();
        const res = await base44.functions.invoke("manageSupportConversation", {
          action: "checkConversationStatus",
          conversation_id: conversation.conversation_id,
          ...actor,
        });
        const data = res?.data || res;
        if (data?.closed && data?.status !== "unavailable") {
          handleClosed(data);
        } else if (data?.status === "ok") {
          // Sync full canonical state (agent may have changed via transfer)
          syncCanonicalState(data);
        }
      } catch {}
      return;
    }
    setLoading(true);
    try {
      const actor = getActor();
      // 1. Check availability
      const availRes = await base44.functions.invoke("manageSupportConversation", {
        action: "getAvailability", ...actor,
      });
      const availData = availRes?.data || availRes;
      if (!availData?.available) {
        setAvailable(false);
        setConversation(null);
        setLoading(false);
        return;
      }
      setAvailable(true);

      // 2. Check for existing active conversation (restore on refresh/navigation)
      const convRes = await base44.functions.invoke("manageSupportConversation", {
        action: "getActiveConversation", page_context: pageContextRef.current, ...actor,
      });
      const convData = convRes?.data || convRes;
      if (convData?.status === "unavailable" || convData?.status === "diagnostic") {
        setAvailable(false);
        setConversation(null);
      } else if (convData?.closed) {
        // Previous conversation was CLOSED by Assist — show completion state
        // with transcript (NOT just fresh intake). This preserves transcript_url
        // and closure_reason on refresh, so the customer can still download.
        // Also preserve customer_preferred_name for the closed-state greeting.
        if (convData.customer_first_name || convData.customer_preferred_name || convData.customer_full_name) {
          const ctx = { ...(customerContextRef.current || {}) };
          if (convData.customer_first_name) ctx.first_name = convData.customer_first_name;
          if (convData.customer_last_name) ctx.last_name = convData.customer_last_name;
          if (convData.customer_full_name) ctx.full_name = convData.customer_full_name;
          if (convData.customer_preferred_name) ctx.preferred_name = convData.customer_preferred_name;
          if (convData.customer_name_complete !== undefined && convData.customer_name_complete !== null) ctx.name_complete = !!convData.customer_name_complete;
          if (convData.name_formality_preference) ctx.formality_preference = convData.name_formality_preference;
          const isum = convData.conversation_issue_summary ?? convData.customer_issue_summary;
          if (isum) ctx.issue_summary = isum;
          if (convData.customer_phone) ctx.phone = convData.customer_phone;
          if (convData.customer_phone_normalized) ctx.phone_normalized = convData.customer_phone_normalized;
          if (convData.customer_phone_verified !== undefined && convData.customer_phone_verified !== null) ctx.phone_verified = !!convData.customer_phone_verified;
          if (convData.customer_phone_source) ctx.phone_source = convData.customer_phone_source;
          if (convData.sms_notification_requested !== undefined) ctx.sms_requested = !!convData.sms_notification_requested;
          if (convData.sms_notification_ready !== undefined) ctx.sms_ready = !!convData.sms_notification_ready;
          if (convData.sms_notification_status) ctx.sms_status = convData.sms_notification_status;
          if (convData.ticket_created !== undefined) ctx.ticket_created = !!convData.ticket_created;
          customerContextRef.current = ctx;
          setCustomerContext(ctx);
        }
        handleClosed({
          closure_reason: convData.closure_reason || null,
          transcript_url: convData.transcript_url || null,
          transcript_offered: convData.transcript_offered ?? false,
          transcript_requested: convData.transcript_requested ?? false,
          transcript_ready: convData.transcript_ready ?? false,
          transcript_status: convData.transcript_status || null,
        });
      } else if (convData?.conversation) {
        const conv = convData.conversation;
        setConversation({
          conversation_id: conv.conversation_id,
          status: conv.status || "active",
          support_agent_id: conv.support_agent_id,
          agent_name: conv.agent_name || "Arriv Support",
          agent_title: conv.agent_title || "Arriv Support",
          agent_avatar_initial: conv.agent_avatar_initial || (conv.agent_name || "A").charAt(0).toUpperCase(),
          agent_avatar_url: conv.agent_avatar_url || "",
          ticket_id: conv.ticket_id || null,
        });
        assignmentRevisionRef.current = conv.agent_assignment_revision ?? null;
        transferStateRef.current = conv.transfer_state ?? null;
        transferStateRevisionRef.current = conv.state_revision ?? conv.agent_assignment_revision ?? null;
        setAssignmentRevision(conv.agent_assignment_revision ?? null);
        setTransferState(conv.transfer_state ?? null);
        setTransferStateRevision(conv.state_revision ?? conv.agent_assignment_revision ?? null);
        setTypingConfig(resolveTypingConfig(conv));
        setAvailable(true);
        // Restore transcript state from canonical conversation (refresh preservation)
        setTranscriptUrl(conv.transcript_url || null);
        setTranscriptOffered(conv.transcript_offered ?? false);
        setTranscriptRequested(conv.transcript_requested ?? false);
        setTranscriptReady(conv.transcript_ready ?? false);
        setTranscriptStatus(conv.transcript_status || null);
        // Restore customer context — unified canonical context from Assist.
        const ctx = {};
        if (conv.customer_first_name) ctx.first_name = conv.customer_first_name;
        if (conv.customer_last_name) ctx.last_name = conv.customer_last_name;
        if (conv.customer_full_name) ctx.full_name = conv.customer_full_name;
        if (conv.customer_preferred_name) ctx.preferred_name = conv.customer_preferred_name;
        if (conv.customer_name_complete !== undefined && conv.customer_name_complete !== null) ctx.name_complete = !!conv.customer_name_complete;
        if (conv.name_formality_preference) ctx.formality_preference = conv.name_formality_preference;
        const isum = conv.conversation_issue_summary ?? conv.customer_issue_summary ?? convData.conversation_issue_summary ?? convData.customer_issue_summary;
        if (isum) ctx.issue_summary = isum;
        if (conv.customer_phone) ctx.phone = conv.customer_phone;
        if (conv.customer_phone_normalized) ctx.phone_normalized = conv.customer_phone_normalized;
        if (conv.customer_phone_verified !== undefined && conv.customer_phone_verified !== null) ctx.phone_verified = !!conv.customer_phone_verified;
        if (conv.customer_phone_source) ctx.phone_source = conv.customer_phone_source;
        if (conv.sms_notification_requested !== undefined) ctx.sms_requested = !!conv.sms_notification_requested;
        if (conv.sms_notification_ready !== undefined) ctx.sms_ready = !!conv.sms_notification_ready;
        if (conv.sms_notification_status) ctx.sms_status = conv.sms_notification_status;
        if (conv.ticket_created !== undefined) ctx.ticket_created = !!conv.ticket_created;
        customerContextRef.current = ctx;
        setCustomerContext(ctx);
        // Merge canonical messages (dedup by ID, canonical chronological sort)
        setMessages(mergeMessages([], convData.messages || [], conv.agent_assignment_revision ?? null));
        // Apply canonical typing if active
        if (conv.agent_typing) {
          applyCanonicalTyping(true, resolveTypingConfig(conv));
        }
      } else {
        // No active conversation — UI shows intake form
        setConversation(null);
        setMessages([]);
      }
    } catch (e) {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [conversation, getActor, handleClosed, syncCanonicalState, applyCanonicalTyping, resolveTypingConfig]);

  // X button — show close confirmation (does NOT close yet)
  const requestClose = useCallback(() => {
    setShowCloseConfirm(true);
  }, []);

  const cancelClose = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  // End Chat — customer-initiated canonical closure via Arriv Assist.
  // Sequence: confirm → closing state → canonical close request → Assist persists
  // CLOSED → CLOSED returned → consume CLOSED → stop polling → reset widget.
  // If canonical close fails: do NOT pretend the chat closed. Restore usable UI.
  const endChat = useCallback(async () => {
    if (closing) return;
    if (!conversation) {
      setShowCloseConfirm(false);
      setOpen(false);
      return;
    }
    setClosing(true);
    // Track closed conversation identity for stale-async protection
    closedConversationIdRef.current = conversation.conversation_id;
    try {
      const actor = getActor();
      const res = await base44.functions.invoke("manageSupportConversation", {
        action: "closeConversation",
        conversation_id: conversation.conversation_id,
        page_context: pageContextRef.current,
        ...actor,
      });
      const data = res?.data || res;
      if (data?.status === "unavailable") {
        // Canonical close failed — do NOT fabricate closure.
        // Restore UI so the customer can retry.
        setShowCloseConfirm(false);
        setClosing(false);
        closedConversationIdRef.current = null;
        return;
      }
      // Canonical close succeeded — consume CLOSED state from response
      setShowCloseConfirm(false);
      handleClosed({
        closure_reason: data?.closure_reason || "CUSTOMER_ENDED",
        transcript_url: data?.transcript_url || null,
      });
    } catch {
      // Network/transport error — do NOT fabricate closure
      setShowCloseConfirm(false);
      setClosing(false);
      closedConversationIdRef.current = null;
    } finally {
      setClosing(false);
    }
  }, [closing, conversation, getActor, handleClosed]);

  // Submit the first issue — creates conversation via Assist, assigns agent
  const submitIssue = useCallback(async (text) => {
    if (!text?.trim() || closed) return;
    setConnecting(true);
    setAvailable(true);
    // Show "Agent is typing..." while waiting for the canonical first-turn bundle.
    // Do NOT render an optimistic customer message — a client-side timestamp can
    // mix with canonical server timestamps and produce wrong chronological order
    // when sequence is missing. The canonical bundle (from getAssistConversation)
    // provides ALL messages in correct canonical order; render them together when
    // the response arrives. Until then, the typing indicator is the only visible
    // state — no out-of-order messages are ever shown.
    setMessages([]);
    setAgentTyping(true);

    try {
      const actor = getActor();
      const res = await base44.functions.invoke("manageSupportConversation", {
        action: "sendMessage",
        conversation_id: null, // first message — Assist creates conversation
        role: "user",
        content: text,
        page_context: pageContextRef.current,
        ...actor,
      });
      const data = res?.data || res;

      if (data?.status === "unavailable") {
        setAvailable(false);
        setConnecting(false);
        setAgentTyping(false);
        return;
      }

      if (data?.closed) {
        setAgentTyping(false);
        handleClosed(data);
        return;
      }

      if (data?.conversation_id && data?.support_agent_id) {
        const agentName = data.agent_name || "Arriv Support";
        // Set initial conversation — syncCanonicalState requires conversation to exist
        setConversation({
          conversation_id: data.conversation_id,
          status: "active",
          support_agent_id: data.support_agent_id,
          agent_name: agentName,
          agent_title: data.agent_title || "Arriv Support",
          agent_avatar_initial: data.agent_avatar_initial || agentName.charAt(0).toUpperCase(),
          agent_avatar_url: data.agent_avatar_url || "",
        });

        // Render the canonical first-turn bundle immediately — no timer-based delay.
        // The backend already fetched the full canonical timeline (startAssistConversation
        // → sendAssistMessage → getAssistConversation) so AGENT_JOINED + first agent
        // response are available with canonical sequence on first render.
        // Guard against close-during-connect: if the customer closed the conversation
        // while the request was in flight, do NOT sync state (CLOSED is terminal).
        setConnecting(false);
        if (!closedRef.current) {
          syncCanonicalState(data);
          // Contract check: first-turn canonical bundle must include AGENT_JOINED.
          // If missing, report it — do not fabricate a join event.
          const hasJoin = (data.messages || []).some(m =>
            m.role === "system" ||
            (m.event_type && ["AGENT_JOINED", "SYSTEM", "EVENT"].includes(String(m.event_type).toUpperCase()))
          );
          if (!hasJoin) {
            console.warn("INITIAL_CANONICAL_JOIN_MISSING", { conversation_id: data.conversation_id });
          }
        }
      } else {
        setConnecting(false);
        setAvailable(false);
        setAgentTyping(false);
      }
    } catch (e) {
      setConnecting(false);
      setAvailable(false);
      setAgentTyping(false);
    }
  }, [getActor, handleClosed, syncCanonicalState]);

  // Poll for server-side changes (manager transfer, join, typing, closure, new messages)
  // while panel is open and conversation is active. Uses enhanced checkConversationStatus
  // which returns full canonical state — discovers changes WITHOUT a new customer message.
  //
  // CONTINUES POLLING after CLOSED if transcript is pending (requested but not
  // ready, no URL, not failed) — so the transcript URL can arrive and be shown
  // to the customer before the widget resets.
  useEffect(() => {
    const transcriptPending = (transcriptRequested || transcriptStatus === "preparing")
      && !transcriptUrl
      && transcriptStatus !== "failed";
    if (!open || !conversation || (closed && !transcriptPending)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const actor = getActor();
        const res = await base44.functions.invoke("manageSupportConversation", {
          action: "checkConversationStatus",
          conversation_id: conversation.conversation_id,
          ...actor,
        });
        if (cancelled) return;
        const data = res?.data || res;
        if (data?.closed && data?.status !== "unavailable") {
          // If already closed, don't re-handle — just sync transcript state.
          // syncCanonicalState extracts transcript fields even when closedRef is true.
          if (closedRef.current) {
            syncCanonicalState(data);
          } else {
            handleClosed(data);
          }
        } else if (data?.status === "ok") {
          // Sync full canonical state — discovers manager transfer, join, typing, new messages
          syncCanonicalState(data);
        }
      } catch {}
    };
    const interval = setInterval(poll, 15000); // poll every 15s for responsive transfer detection
    return () => { cancelled = true; clearInterval(interval); };
  }, [open, conversation, closed, transcriptRequested, transcriptStatus, transcriptUrl, getActor, handleClosed, syncCanonicalState]);

  // Render canonical agent response from Arriv Assist.
  // The host is a HOST CLIENT — it does NOT independently classify intent,
  // run diagnostics, create tickets, or generate work states. It renders the
  // canonical response and work-state metadata returned by Arriv Assist.
  const sendUserMessage = useCallback(async (text) => {
    if (!text?.trim() || !conversation || closed) return;
    setSending(true);
    // Show "Agent is typing..." while waiting for the canonical response.
    // The agent's response will only render when the full canonical timeline
    // arrives in correct order — never out of order.
    setAgentTyping(true);
    const userMsg = { id: `user-${Date.now()}`, role: "user", content: text, repair_state: "none", created_date: new Date().toISOString() };
    setMessages((prev) => mergeMessages(prev, [userMsg], assignmentRevisionRef.current));

    try {
      const actor = getActor();
      const res = await base44.functions.invoke("manageSupportConversation", {
        action: "sendMessage",
        conversation_id: conversation.conversation_id,
        role: "user",
        content: text,
        page_context: pageContextRef.current,
        ...actor,
      });
      const userRes = res?.data || res;

      // Canonical CLOSED — show completion, reset to fresh intake
      if (userRes?.closed) {
        handleClosed(userRes);
        return;
      }

      // Sync canonical state (agent, revision, transfer, typing, messages, transcript)
      syncCanonicalState(userRes);

      // Closing-state agent response (TRANSCRIPT_OFFERED, RESOLVED, CLOSING) —
      // show the agent's reply from Assist and skip local logic. The host does
      // NOT independently determine conversation state; it reacts to Assist's
      // status. syncCanonicalState already extracted transcript_url/state.
      const convStatus = (userRes?.conversation_status || "").toUpperCase();
      if (userRes?.message && ["TRANSCRIPT_OFFERED", "RESOLVED", "CLOSING"].includes(convStatus)) {
        setSending(false);
        return;
      }

      setSending(false);
    } catch {
      setSending(false);
      setAgentTyping(false);
    }
  }, [conversation, getActor, handleClosed, syncCanonicalState]);

  const escalate = useCallback(async (summary) => {
    if (!conversation) return null;
    try {
      const actor = getActor();
      const res = await base44.functions.invoke("manageSupportConversation", {
        action: "createTicket",
        conversation_id: conversation.conversation_id,
        summary, severity: "L3", ...actor,
      });
      const data = res?.data || res;
      if (data?.ticket_number) {
        setConversation((c) => ({ ...c, ticket_id: data.ticket_id }));
      }
      return data;
    } catch { return null; }
  }, [conversation, getActor]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearTypingTimers();
  }, [clearTypingTimers]);

  const value = {
    open, setOpen, available,
    loading, sending, connecting, agentTyping,
    conversation, messages,
    transferState, assignmentRevision, typingConfig,
    closed, closureReason, transcriptUrl,
    transcriptStatus, transcriptOffered, transcriptRequested, transcriptReady,
    customerContext,
    showCloseConfirm, closing,
    startSupport, submitIssue, sendUserMessage, escalate,
    resetConversation, requestClose, cancelClose, endChat,
    pageContext: pageContextRef.current,
  };

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

