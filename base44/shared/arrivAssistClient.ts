// arrivAssistClient.ts
// Cross-app transport client for Arriv Estate Media → Arriv Assist.
//
// AUTHORITY MODEL:
//   Arriv Assist is the SOLE canonical authority for:
//     - SupportAgent registry + agent assignment
//     - AssistConversation records
//     - AssistTicket (AST-####) numbering + records
//     - central L0-L3 capability metadata
//
//   Arriv Estate Media is authoritative ONLY for:
//     - Arriv Estate Media application data
//     - Arriv Estate Media diagnostics / repair execution / repair verification
//     - Arriv Estate Media product-specific support capabilities
//
// RESPONSE ENVELOPE:
//   { success: boolean, error_code: string|null, message: string|null,
//     data: <payload>|null, contract_version: string }
//
// AUTH:
//   HMAC-SHA256 signed requests using ARRIV_ASSIST_AUTH_SECRET.
//   Headers: x-arriv-assist-signature, x-arriv-assist-timestamp (Unix ms)
//   Canonical: timestamp.functionName.body
//
//   If Arriv Assist is not configured or unreachable, every call returns
//   { available: false } and the host app surfaces an honest
//   "temporarily unavailable" state. NEVER invents agents or fabricates
//   a replacement identity.

// ============================================================
// TYPES
// ============================================================

export interface AssistAvailability {
  available: boolean;
  reason?: string;
  endpoint?: string;
}

export interface AssistIdentity {
  available: boolean;
  reason?: string;
  app_id?: string;
  product_key?: string;
  contract_version?: string;
  backend_functions_live?: boolean;
}

export interface AssistAgent {
  agent_id: string;
  name: string;
  title: string;
  avatar_initial: string;
  avatar_url?: string;
  specialty?: string;
  tier_focus?: string;
  active: boolean;
}

export interface AssistConversationResult {
  available: boolean;
  reason?: string;
  conversation_id?: string;
  support_agent_id?: string;
  agent_name?: string;
  agent_title?: string;
  agent_avatar_initial?: string;
  agent_avatar_url?: string;
  status?: string;
  closure_reason?: string;
  transcript_url?: string;
  transcript_offered?: boolean;
  transcript_requested?: boolean;
  transcript_ready?: boolean;
  transcript_status?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  customer_full_name?: string;
  customer_preferred_name?: string;
  customer_name_complete?: boolean;
  name_formality_preference?: string;
  customer_issue_summary?: string;
  customer_phone?: string;
  customer_phone_normalized?: string;
  customer_phone_verified?: boolean;
  customer_phone_source?: string;
  sms_notification_requested?: boolean;
  sms_notification_ready?: boolean;
  sms_notification_status?: string;
  ticket_created?: boolean;
  messages?: any[];
  ticket_id?: string;
  ticket_number?: string;
  agent_assignment_revision?: number | string;
  transfer_state?: string;
  agent_typing?: boolean;
  agent_state?: string;
  state_updated_at?: string;
  state_revision?: number | string;
  current_agent_id?: string;
  typing_indicator_enabled?: boolean;
  typing_indicator_min_visible_ms?: number;
  typing_indicator_max_visible_ms?: number;
}

export interface AssistMessageResult {
  available: boolean;
  reason?: string;
  conversation_id?: string;
  support_agent_id?: string;
  agent_name?: string;
  agent_title?: string;
  agent_avatar_initial?: string;
  agent_avatar_url?: string;
  message?: any;
  messages?: any[];
  conversation_status?: string;
  closure_reason?: string;
  transcript_url?: string;
  transcript_offered?: boolean;
  transcript_requested?: boolean;
  transcript_ready?: boolean;
  transcript_status?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  customer_full_name?: string;
  customer_preferred_name?: string;
  customer_name_complete?: boolean;
  name_formality_preference?: string;
  customer_issue_summary?: string;
  customer_phone?: string;
  customer_phone_normalized?: string;
  customer_phone_verified?: boolean;
  customer_phone_source?: string;
  sms_notification_requested?: boolean;
  sms_notification_ready?: boolean;
  sms_notification_status?: string;
  ticket_created?: boolean;
  agent_assignment_revision?: number | string;
  transfer_state?: string;
  agent_typing?: boolean;
  agent_state?: string;
  state_updated_at?: string;
  state_revision?: number | string;
  current_agent_id?: string;
  typing_indicator_enabled?: boolean;
  typing_indicator_min_visible_ms?: number;
  typing_indicator_max_visible_ms?: number;
}

export interface AssistTicketResult {
  available: boolean;
  reason?: string;
  ticket_number?: string;
  ticket_id?: string;
  ticket?: any;
}

export interface AssistCapabilitiesResult {
  available: boolean;
  reason?: string;
  capabilities?: any[];
}

export interface AssistContextResult {
  available: boolean;
  reason?: string;
  conversation?: any;
  agent?: AssistAgent | null;
  ticket?: any;
  incident?: any;
  messages?: any[];
}

// ============================================================
// CONFIGURATION
// ============================================================

export function isAssistConfigured(secrets: any): boolean {
  const endpoint = secrets.get("ARRIV_ASSIST_ENDPOINT");
  const secret = secrets.get("ARRIV_ASSIST_AUTH_SECRET");
  return !!(endpoint && secret);
}

export function getAssistEndpoint(secrets: any): string | null {
  const endpoint = secrets.get("ARRIV_ASSIST_ENDPOINT");
  if (!endpoint) return null;
  return String(endpoint).replace(/\s+/g, "").replace(/\/+$/, "");
}

function getAssistSecret(secrets: any): string | null {
  const secret = secrets.get("ARRIV_ASSIST_AUTH_SECRET");
  if (!secret) return null;
  return String(secret).replace(/\s+/g, "");
}

// ============================================================
// HMAC SIGNING
// ============================================================

/**
 * Sign an outbound request to Arriv Assist using the authoritative contract:
 *   canonical = TIMESTAMP + "." + FUNCTION_NAME + "." + RAW_BODY_TEXT
 *   signature  = HMAC_SHA256_HEX(UTF8(secret), UTF8(canonical))
 *
 * Headers sent:
 *   x-arriv-assist-timestamp : String(timestamp)
 *   x-arriv-assist-signature  : hex signature
 *
 * No method, path, nonce, or query string participate in the canonical string.
 * The body string passed here MUST be the exact string transmitted in the HTTP
 * request body — the caller constructs it once and passes the same reference.
 */
async function signRequest(
  functionName: string,
  body: string,
  secret: string
): Promise<Record<string, string>> {
  const timestamp = Date.now().toString();
  const canonical = `${timestamp}.${functionName}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
  const signature = Array.from(new Uint8Array(sig))
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    "x-arriv-assist-signature": signature,
    "x-arriv-assist-timestamp": timestamp,
    "Content-Type": "application/json",
  };
}

// ============================================================
// CORE TRANSPORT
// ============================================================

async function postAssist<T>(
  secrets: any,
  functionName: string,
  payload: any,
  timeoutMs = 10000
): Promise<{ ok: boolean; data?: T; reason?: string; envelope?: any }> {
  const endpoint = getAssistEndpoint(secrets);
  const secret = getAssistSecret(secrets);
  if (!endpoint || !secret) {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
  const path = `/api/functions/${functionName}`;
  const bodyText = JSON.stringify(payload);

  // Retryable transient failures: 503 (cold start / overload), 502, 504,
  // TIMEOUT, UNREACHABLE. Up to 3 attempts with exponential backoff.
  const MAX_ATTEMPTS = 3;
  let lastReason: string | undefined;
  let lastEnvelope: any;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Re-sign each attempt — the timestamp must be fresh for HMAC validation.
    const headers = await signRequest(functionName, bodyText, secret);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${endpoint}${path}`, { method: "POST", headers, body: bodyText, signal: ctrl.signal });
      clearTimeout(t);
      const json = await res.json();
      if (res.ok && json.success) {
        return { ok: true, data: json.data as T, envelope: json };
      }
      lastReason = json.error_code || json.message || `HTTP_${res.status}`;
      lastEnvelope = json;
      // Retry on 502/503/504 — transient server errors.
      const transient = res.status === 502 || res.status === 503 || res.status === 504;
      if (!transient || attempt === MAX_ATTEMPTS) {
        return { ok: false, reason: lastReason, envelope: lastEnvelope };
      }
    } catch (e: any) {
      lastReason = e?.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, reason: lastReason };
      }
    }
    // Exponential backoff: 400ms, 900ms
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return { ok: false, reason: lastReason, envelope: lastEnvelope };
}

// ============================================================
// PUBLIC API — CANONICAL FUNCTIONS
// ============================================================

/**
 * assistHealth — verify remote Arriv Assist identity.
 * No auth required (public health endpoint).
 */
export async function fetchAssistHealth(secrets: any): Promise<AssistIdentity> {
  const endpoint = getAssistEndpoint(secrets);
  if (!endpoint) return { available: false, reason: "NOT_CONFIGURED" };

  // Single attempt helper with extended timeout for cold starts
  const attempt = async (): Promise<AssistIdentity> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${endpoint}/api/functions/assistHealth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const json = await res.json();
      if (!res.ok || !json.success) return { available: false, reason: json.error_code || `HTTP_${res.status}` };
      const d = json.data;
      return {
        available: true,
        app_id: d.app_id,
        product_key: d.product_key,
        contract_version: d.contract_version,
        backend_functions_live: d.backend_functions_live,
      };
    } catch (e: any) {
      return { available: false, reason: e?.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE" };
    }
  };

  // Retry up to 3 attempts with short backoff to handle cold-start 503s.
  for (let i = 0; i < 3; i++) {
    const result = await attempt();
    if (result.available) return result;
    if (i < 2) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return { available: false, reason: "UNREACHABLE" };
}

/**
 * assistGetAgentRegistry — fetch the canonical agent roster from Assist.
 */
export async function listAssistAgents(
  secrets: any,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<{ available: boolean; agents?: AssistAgent[]; reason?: string }> {
  const r = await postAssist<any>(secrets, "assistGetAgentRegistry", {
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const rawAgents = r.data?.agents || [];
  const agents: AssistAgent[] = rawAgents.map((a: any) => ({
    agent_id: a.agent_id,
    name: a.display_name || a.name || "",
    title: a.agent_role || a.title || "",
    avatar_initial: (a.display_name || a.name || "A").charAt(0).toUpperCase(),
    avatar_url: a.avatar_url || undefined,
    specialty: a.specialty,
    tier_focus: a.tier_focus,
    active: a.is_active !== undefined ? a.is_active : (a.status === "ACTIVE" || a.active === true),
  }));
  return { available: true, agents };
}

/**
 * Validate an agent_id against the canonical Arriv Assist registry.
 */
export async function validateAssistAgentId(
  secrets: any,
  agentId: string,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<{ valid: boolean; reason?: string }> {
  if (!agentId) return { valid: false, reason: "UNKNOWN_AGENT" };
  const r = await listAssistAgents(secrets, auth);
  if (!r.available) return { valid: false, reason: "UNAVAILABLE" };
  const found = r.agents!.find((a) => a.agent_id === agentId && a.active);
  return found ? { valid: true } : { valid: false, reason: "UNKNOWN_AGENT" };
}

/**
 * assistStartConversation — create a canonical conversation and assign
 * the canonical support agent. Arriv Assist owns conversation creation and
 * agent assignment. This function does NOT persist the user's initial message;
 * the caller must follow up with sendAssistMessage() to persist the first issue.
 *
 * IMPORTANT: This function returns a RAW response (no standard success envelope).
 * It is parsed narrowly here — do NOT route through postAssist().
 */
export async function startAssistConversation(
  secrets: any,
  params: {
    role?: string;
    content?: string;
    repair_state?: string;
    capability_id?: string;
    page_context?: any;
    metadata?: any;
  },
  auth: {
    actor_user_id: string;
    actor_email: string;
    actor_role: string;
    tenant_id: string;
    user_display_name: string;
    user_type: string;
    view_as_tenant_id?: string;
    is_platform_authority: boolean;
  }
): Promise<{
  available: boolean;
  reason?: string;
  conversation_id?: string;
  support_agent_id?: string;
  agent_name?: string;
  agent_specialty?: string;
  agent_avatar_color?: string;
  agent_avatar_url?: string;
  assignment_status?: string;
}> {
  const endpoint = getAssistEndpoint(secrets);
  const secret = getAssistSecret(secrets);
  if (!endpoint || !secret) return { available: false, reason: "NOT_CONFIGURED" };
  const functionName = "assistStartConversation";
  const path = `/api/functions/${functionName}`;
  const payload = {
    conversation_id: null,
    role: params.role || "user",
    content: params.content || "",
    repair_state: params.repair_state || "none",
    capability_id: params.capability_id || "",
    metadata: params.metadata || null,
    page_context: params.page_context || null,
    actor_user_id: auth.actor_user_id,
    actor_email: auth.actor_email,
    actor_role: auth.actor_role,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    user_display_name: auth.user_display_name,
    user_type: auth.user_type,
    view_as_tenant_id: auth.view_as_tenant_id || null,
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  };
  const body = JSON.stringify(payload);
  const headers = await signRequest(functionName, body, secret);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${endpoint}${path}`, { method: "POST", headers, body, signal: ctrl.signal });
    clearTimeout(t);
    const json = await res.json();
    if (!res.ok) {
      return { available: false, reason: json?.error_code || json?.message || `HTTP_${res.status}` };
    }
    const convId = json.conversation_id;
    const agentId = json.support_agent?.agent_id;
    const agentName = json.support_agent?.display_name;
    const assignmentStatus = json.assignment_status;
    if (!convId || !agentId || !agentName || !assignmentStatus) {
      return { available: false, reason: "MALFORMED_RESPONSE" };
    }
    return {
      available: true,
      conversation_id: convId,
      support_agent_id: agentId,
      agent_name: agentName,
      agent_specialty: json.support_agent?.specialty || undefined,
      agent_avatar_color: json.support_agent?.avatar_color || undefined,
      agent_avatar_url: json.support_agent?.avatar_url || undefined,
      assignment_status: assignmentStatus,
    };
  } catch (e: any) {
    return { available: false, reason: e?.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE" };
  }
}

/**
 * assistSendMessage — send a message into an EXISTING conversation.
 * Requires a valid conversation_id (from assistStartConversation or a prior
 * assistSendMessage). Arriv Assist owns message persistence and agent state.
 */
export async function sendAssistMessage(
  secrets: any,
  params: {
    conversation_id?: string;
    role: string;
    content: string;
    repair_state?: string;
    capability_id?: string;
    ticket_number?: string;
    metadata?: any;
    page_context?: any;
  },
  auth: {
    actor_user_id: string;
    actor_email: string;
    actor_role: string;
    tenant_id: string;
    user_display_name: string;
    user_type: string;
    view_as_tenant_id?: string;
    is_platform_authority: boolean;
  }
): Promise<AssistMessageResult> {
  const r = await postAssist<any>(secrets, "assistSendMessage", {
    conversation_id: params.conversation_id || null,
    role: params.role,
    message: params.content, // Arriv Assist expects `message`, not `content`
    repair_state: params.repair_state || "none",
    capability_id: params.capability_id || "",
    ticket_number: params.ticket_number || "",
    metadata: params.metadata || null,
    page_context: params.page_context || null,
    actor_user_id: auth.actor_user_id,
    actor_email: auth.actor_email,
    actor_role: auth.actor_role,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    user_display_name: auth.user_display_name,
    user_type: auth.user_type,
    view_as_tenant_id: auth.view_as_tenant_id || null,
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const d = r.data;
  let mappedMessages: any[] = [];
  if (Array.isArray(d?.messages) && d.messages.length > 0) {
    mappedMessages = d.messages.map((m: any) => {
      const msgType = (m.message_type || "").toUpperCase();
      const senderType = (m.sender_type || "agent").toLowerCase();
      const isSystem = senderType === "system" || msgType === "SYSTEM" || msgType === "AGENT_JOINED" || msgType === "EVENT";
      return {
        id: m.message_id || m.id || `msg-${m.created_date || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: isSystem ? "system" : senderType,
        content: m.message || "",
        repair_state: "none",
        event_type: msgType || undefined,
        agent_id: m.agent_id || m.support_agent_id || undefined,
        agent_name: m.agent_name || m.support_agent_name || undefined,
        agent_title: m.agent_title || m.support_agent_title || undefined,
        created_date: m.created_date || new Date().toISOString(),
        sequence: m.sequence ?? m.seq ?? undefined,
        assignment_revision: m.assignment_revision ?? m.agent_assignment_revision ?? undefined,
      };
    });
  }
  const agentReply = mappedMessages.length > 0
    ? mappedMessages.find((m: any) => m.role === "agent") || null
    : (d?.response ? {
        id: d.message_id || d.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "agent",
        content: d.response,
        repair_state: (d.presence_state || "").toLowerCase() || "none",
        ticket_number: d.ticket_number || undefined,
        created_date: d.created_date || new Date().toISOString(),
        sequence: d.sequence ?? d.seq ?? undefined,
        assignment_revision: d.assignment_revision ?? d.agent_assignment_revision ?? undefined,
      } : null);
  return {
    available: true,
    conversation_id: params.conversation_id,
    support_agent_id: d?.support_agent_id || d?.current_agent_id || undefined,
    agent_name: d?.agent_name,
    agent_title: d?.agent_title || undefined,
    agent_avatar_initial: d?.agent_name ? d.agent_name.charAt(0).toUpperCase() : undefined,
    agent_avatar_url: d?.agent_avatar_url || d?.support_agent?.avatar_url || undefined,
    message: agentReply,
    messages: mappedMessages.length > 0 ? mappedMessages : (agentReply ? [agentReply] : []),
    conversation_status: d?.conversation_status || d?.status || undefined,
    closure_reason: d?.closure_reason || undefined,
    transcript_url: d?.transcript_url || d?.transcript_download_url || d?.download_url || undefined,
    transcript_offered: d?.transcript_offered ?? false,
    transcript_requested: d?.transcript_requested ?? false,
    transcript_ready: d?.transcript_ready ?? false,
    transcript_status: d?.transcript_status || undefined,
    customer_first_name: d?.customer_first_name || undefined,
    customer_last_name: d?.customer_last_name || undefined,
    customer_full_name: d?.customer_full_name || undefined,
    customer_preferred_name: d?.customer_preferred_name || undefined,
    customer_name_complete: d?.customer_name_complete ?? undefined,
    name_formality_preference: d?.name_formality_preference || undefined,
    customer_issue_summary: d?.conversation_issue_summary ?? d?.customer_issue_summary ?? undefined,
    customer_phone: d?.customer_phone || undefined,
    customer_phone_normalized: d?.customer_phone_normalized || undefined,
    customer_phone_verified: d?.customer_phone_verified ?? undefined,
    customer_phone_source: d?.customer_phone_source || undefined,
    sms_notification_requested: d?.sms_notification_requested ?? undefined,
    sms_notification_ready: d?.sms_notification_ready ?? undefined,
    sms_notification_status: d?.sms_notification_status || undefined,
    ticket_created: d?.ticket_created ?? undefined,
    agent_assignment_revision: d?.agent_assignment_revision ?? undefined,
    transfer_state: d?.transfer_state ?? undefined,
    agent_typing: d?.agent_typing ?? false,
    agent_state: d?.agent_state ?? undefined,
    state_updated_at: d?.state_updated_at ?? undefined,
    state_revision: d?.state_revision ?? undefined,
    current_agent_id: d?.current_agent_id ?? undefined,
    typing_indicator_enabled: d?.typing_indicator_enabled ?? undefined,
    typing_indicator_min_visible_ms: d?.typing_indicator_min_visible_ms ?? undefined,
    typing_indicator_max_visible_ms: d?.typing_indicator_max_visible_ms ?? undefined,
  };
}

/**
 * assistGetConversation — fetch canonical conversation state from Assist.
 */
export async function getAssistConversation(
  secrets: any,
  conversationId: string,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<AssistConversationResult> {
  const r = await postAssist<any>(secrets, "assistGetConversation", {
    conversation_id: conversationId,
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const d = r.data;
  const agentName = d?.support_agent?.display_name || "";
  const conv = d?.conversation || {};
  const mappedMessages = (d?.messages || []).map((m: any) => {
    const msgType = (m.message_type || "").toUpperCase();
    const senderType = (m.sender_type || "agent").toLowerCase();
    const isSystem = senderType === "system" || msgType === "SYSTEM" || msgType === "AGENT_JOINED" || msgType === "EVENT";
    return {
      id: m.message_id || m.id || `msg-${m.created_date || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: isSystem ? "system" : senderType,
      content: m.message || "",
      repair_state: "none",
      event_type: msgType || undefined,
      agent_id: m.agent_id || m.support_agent_id || undefined,
      agent_name: m.agent_name || m.support_agent_name || undefined,
      agent_title: m.agent_title || m.support_agent_title || undefined,
      created_date: m.created_date || new Date().toISOString(),
      sequence: m.sequence ?? m.seq ?? undefined,
      assignment_revision: m.assignment_revision ?? m.agent_assignment_revision ?? undefined,
    };
  });
  return {
    available: true,
    conversation_id: conv.conversation_id || conversationId,
    support_agent_id: d?.support_agent?.agent_id || "",
    agent_name: agentName,
    agent_title: d?.support_agent?.agent_role || undefined,
    agent_avatar_initial: agentName ? agentName.charAt(0).toUpperCase() : "",
    agent_avatar_url: d?.support_agent?.avatar_url || undefined,
    status: conv.status || "",
    closure_reason: conv.closure_reason || undefined,
    transcript_url: conv.transcript_url || conv.transcript_download_url || d?.ticket?.transcript_url || undefined,
    transcript_offered: conv.transcript_offered ?? d?.transcript_offered ?? false,
    transcript_requested: conv.transcript_requested ?? d?.transcript_requested ?? false,
    transcript_ready: conv.transcript_ready ?? d?.transcript_ready ?? false,
    transcript_status: conv.transcript_status || d?.transcript_status || undefined,
    customer_first_name: conv.customer_first_name || d?.customer_first_name || undefined,
    customer_last_name: conv.customer_last_name || d?.customer_last_name || undefined,
    customer_full_name: conv.customer_full_name || d?.customer_full_name || undefined,
    customer_preferred_name: conv.customer_preferred_name || d?.customer_preferred_name || undefined,
    customer_name_complete: conv.customer_name_complete ?? d?.customer_name_complete ?? undefined,
    name_formality_preference: conv.name_formality_preference || d?.name_formality_preference || undefined,
    customer_issue_summary: conv.conversation_issue_summary ?? conv.customer_issue_summary ?? d?.conversation_issue_summary ?? d?.customer_issue_summary ?? undefined,
    customer_phone: conv.customer_phone || d?.customer_phone || undefined,
    customer_phone_normalized: conv.customer_phone_normalized || d?.customer_phone_normalized || undefined,
    customer_phone_verified: conv.customer_phone_verified ?? d?.customer_phone_verified ?? undefined,
    customer_phone_source: conv.customer_phone_source || d?.customer_phone_source || undefined,
    sms_notification_requested: conv.sms_notification_requested ?? d?.sms_notification_requested ?? undefined,
    sms_notification_ready: conv.sms_notification_ready ?? d?.sms_notification_ready ?? undefined,
    sms_notification_status: conv.sms_notification_status || d?.sms_notification_status || undefined,
    ticket_created: conv.ticket_created ?? d?.ticket_created ?? undefined,
    messages: mappedMessages,
    ticket_id: d?.ticket?.ticket_id || undefined,
    ticket_number: d?.ticket?.ticket_number || undefined,
    agent_assignment_revision: conv.agent_assignment_revision ?? d?.agent_assignment_revision ?? undefined,
    transfer_state: conv.transfer_state ?? d?.transfer_state ?? undefined,
    agent_typing: conv.agent_typing ?? d?.agent_typing ?? false,
    agent_state: conv.agent_state ?? d?.agent_state ?? undefined,
    state_updated_at: conv.state_updated_at ?? d?.state_updated_at ?? undefined,
    state_revision: conv.state_revision ?? d?.state_revision ?? undefined,
    current_agent_id: conv.current_agent_id ?? d?.current_agent_id ?? undefined,
    typing_indicator_enabled: conv.typing_indicator_enabled ?? d?.typing_indicator_enabled ?? undefined,
    typing_indicator_min_visible_ms: conv.typing_indicator_min_visible_ms ?? d?.typing_indicator_min_visible_ms ?? undefined,
    typing_indicator_max_visible_ms: conv.typing_indicator_max_visible_ms ?? d?.typing_indicator_max_visible_ms ?? undefined,
  };
}

/**
 * assistCreateTicket — create a support ticket. Arriv Assist owns AST-#### numbering.
 */
export async function createAssistTicket(
  secrets: any,
  conversationId: string,
  severity: string,
  summary: string,
  auth: { actor_user_id: string; actor_email: string; tenant_id: string; user_display_name: string; is_platform_authority: boolean }
): Promise<AssistTicketResult> {
  const r = await postAssist<{ ticket_number: string; ticket_id: string; ticket?: any }>(secrets, "assistCreateTicket", {
    conversation_id: conversationId,
    severity,
    summary,
    actor_user_id: auth.actor_user_id,
    actor_email: auth.actor_email,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    user_display_name: auth.user_display_name,
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  return {
    available: true,
    ticket_number: r.data!.ticket_number,
    ticket_id: r.data!.ticket_id,
    ticket: r.data!.ticket,
  };
}

/**
 * assistGetTicket — retrieve a ticket from Assist.
 */
export async function getAssistTicket(
  secrets: any,
  ticketId: string,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<AssistTicketResult> {
  const r = await postAssist<any>(secrets, "assistGetTicket", {
    ticket_id: ticketId,
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  return { available: true, ticket: r.data, ticket_id: ticketId };
}

/**
 * assistGetSupportCapabilities — fetch the central Assist capability contract.
 */
export async function getAssistCapabilities(
  secrets: any,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<AssistCapabilitiesResult> {
  const r = await postAssist<{ capabilities: any[] }>(secrets, "assistGetSupportCapabilities", {
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  return { available: true, capabilities: r.data?.capabilities || [] };
}

/**
 * assistGetSupportContext — fetch full support context for a conversation.
 */
export async function getAssistSupportContext(
  secrets: any,
  conversationId: string,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<AssistContextResult> {
  const r = await postAssist<any>(secrets, "assistGetSupportContext", {
    conversation_id: conversationId,
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const d = r.data;
  return {
    available: true,
    conversation: d.conversation,
    agent: d.agent,
    ticket: d.ticket,
    incident: d.incident,
    messages: d.messages || [],
  };
}

/**
 * assistCloseConversation — canonical customer-initiated closure.
 * Requests Arriv Assist to close the conversation with closure_reason = CUSTOMER_ENDED.
 * Arriv Estate Media must NOT locally declare a conversation CLOSED.
 */
export async function closeAssistConversation(
  secrets: any,
  conversationId: string,
  auth: { actor_user_id: string; tenant_id: string; is_platform_authority: boolean }
): Promise<AssistConversationResult> {
  const r = await postAssist<any>(secrets, "assistCloseConversation", {
    conversation_id: conversationId,
    closure_reason: "CUSTOMER_ENDED",
    actor_user_id: auth.actor_user_id,
    tenant_id: auth.tenant_id,
    source_tenant_reference: auth.tenant_id || "platform",
    is_platform_authority: auth.is_platform_authority,
    source_application: "arriv_estate_media",
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const d = r.data;
  const conv = d?.conversation || {};
  const agentName = d?.support_agent?.display_name || "";
  return {
    available: true,
    conversation_id: conv.conversation_id || conversationId,
    support_agent_id: d?.support_agent?.agent_id || "",
    agent_name: agentName,
    agent_title: d?.support_agent?.agent_role || undefined,
    agent_avatar_initial: agentName ? agentName.charAt(0).toUpperCase() : "",
    agent_avatar_url: d?.support_agent?.avatar_url || undefined,
    status: conv.status || "",
    closure_reason: conv.closure_reason || d?.closure_reason || "CUSTOMER_ENDED",
    transcript_url: conv.transcript_url || conv.transcript_download_url || d?.transcript_url || undefined,
    transcript_offered: conv.transcript_offered ?? d?.transcript_offered ?? false,
    transcript_requested: conv.transcript_requested ?? d?.transcript_requested ?? false,
    transcript_ready: conv.transcript_ready ?? d?.transcript_ready ?? false,
    transcript_status: conv.transcript_status || d?.transcript_status || undefined,
    customer_first_name: conv.customer_first_name || d?.customer_first_name || undefined,
    customer_last_name: conv.customer_last_name || d?.customer_last_name || undefined,
    customer_full_name: conv.customer_full_name || d?.customer_full_name || undefined,
    customer_preferred_name: conv.customer_preferred_name || d?.customer_preferred_name || undefined,
    customer_name_complete: conv.customer_name_complete ?? d?.customer_name_complete ?? undefined,
    name_formality_preference: conv.name_formality_preference || d?.name_formality_preference || undefined,
    customer_issue_summary: conv.conversation_issue_summary ?? conv.customer_issue_summary ?? d?.conversation_issue_summary ?? d?.customer_issue_summary ?? undefined,
    customer_phone: conv.customer_phone || d?.customer_phone || undefined,
    customer_phone_normalized: conv.customer_phone_normalized || d?.customer_phone_normalized || undefined,
    customer_phone_verified: conv.customer_phone_verified ?? d?.customer_phone_verified ?? undefined,
    customer_phone_source: conv.customer_phone_source || d?.customer_phone_source || undefined,
    sms_notification_requested: conv.sms_notification_requested ?? d?.sms_notification_requested ?? undefined,
    sms_notification_ready: conv.sms_notification_ready ?? d?.sms_notification_ready ?? undefined,
    sms_notification_status: conv.sms_notification_status || d?.sms_notification_status || undefined,
    ticket_created: conv.ticket_created ?? d?.ticket_created ?? undefined,
    messages: [],
    agent_assignment_revision: conv.agent_assignment_revision ?? d?.agent_assignment_revision ?? undefined,
    transfer_state: conv.transfer_state ?? d?.transfer_state ?? undefined,
    state_revision: conv.state_revision ?? d?.state_revision ?? undefined,
    current_agent_id: conv.current_agent_id ?? d?.current_agent_id ?? undefined,
  };
}

export const fetchAssistIdentity = fetchAssistHealth;