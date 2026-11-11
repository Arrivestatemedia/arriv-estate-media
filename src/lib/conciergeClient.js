import { base44 } from '@/api/base44Client';
import { withCustomerSession } from '@/lib/customerSession';

/**
 * Browser client for the Arriv Preferred Concierge.
 * Every call carries the existing verified customer session; the server re-derives
 * identity, entitlement and ownership from it.
 */

async function invoke(name, payload = {}) {
  const response = await base44.functions.invoke(name, withCustomerSession(payload));
  return response?.data ?? response;
}

export async function fetchConciergeEntitlement() {
  try {
    return await invoke('getConciergeEntitlement');
  } catch (error) {
    // A missing/expired customer session simply means "not a Preferred member" here;
    // the portal's own session handling deals with expiry.
    if (Number(error?.status || error?.response?.status) === 401) return null;
    throw error;
  }
}

export function askConcierge({ utterance, sessionId, conversationId, context, channel = 'text' }) {
  return invoke('conciergeAgent', {
    utterance,
    session_id: sessionId || undefined,
    conversation_id: conversationId || undefined,
    context: context || {},
    channel,
  });
}

export function confirmConciergeAction({ actionRecordId, decision }) {
  return invoke('conciergeConfirmAction', {
    action_record_id: actionRecordId,
    decision: decision || 'confirm',
  });
}

export async function startConciergeVideo(sessionId, { fresh = false } = {}) {
  try {
    return await invoke('conciergeTavusSession', {
      action: 'start',
      session_id: sessionId || undefined,
      fresh,
    });
  } catch (error) {
    // A failed start comes back as a non-2xx response; surface the server's own reason
    // instead of a generic message, so a real configuration problem stays visible.
    const body = error?.response?.data || error?.data;
    if (body && typeof body === 'object') return body;
    throw error;
  }
}

/**
 * The video representative's app tools are handed to the browser, so the portal runs them
 * here against the same action engine as the text concierge. Identity and entitlement are
 * re-derived server-side from the conversation and this customer's session.
 */
export async function runVideoConciergeTool({ toolName, args, conversationId }) {
  try {
    return await invoke('conciergeTavusTool', {
      tool_name: toolName,
      arguments: args || {},
      conversation_id: conversationId,
      utterance: String(args?.reason || 'video request').slice(0, 400),
    });
  } catch (error) {
    const body = error?.response?.data || error?.data;
    if (body && typeof body === 'object') return body;
    return { ok: false, reply: 'That request could not be completed.' };
  }
}

export function endConciergeVideo(sessionId) {
  return invoke('conciergeTavusSession', { action: 'end', session_id: sessionId || undefined });
}

export function fetchConciergeNotices(action = 'refresh') {
  return invoke('conciergeNotices', { action });
}

export function markConciergeNotice(noticeId, action) {
  return invoke('conciergeNotices', { action, notice_id: noticeId });
}