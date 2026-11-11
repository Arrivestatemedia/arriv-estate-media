import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { runConciergeAction, actionRequiresConfirmation } from '../../shared/conciergeActions.ts';

/**
 * Confirmation endpoint for consequential concierge actions.
 *
 * The record must belong to the signed-in customer, still be awaiting confirmation and
 * be recent. Execution is idempotent: confirming twice returns the first real result
 * instead of repeating the work, so a double-click or a retried request cannot create a
 * duplicate change.
 */

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: 'SESSION_REQUIRED', error: auth.error }, { status: auth.status });
    }
    const email = auth.actor.email;

    const entitlement = await resolvePreferredEntitlement(base44, { email, accountId: auth.actor.account_id });
    if (!entitlement.active) {
      return Response.json({ ok: false, reason: 'PREFERRED_REQUIRED' }, { status: 403 });
    }

    const actionRecordId = String(body?.action_record_id || '').trim();
    const decision = String(body?.decision || 'confirm');
    if (!actionRecordId) {
      return Response.json({ ok: false, error: 'An action is required.' }, { status: 400 });
    }

    const record = rowsOf(await base44.asServiceRole.entities.ConciergeAction
      .filter({ action_id: actionRecordId, customer_email: email }, { limit: 1 }))[0];
    if (!record) {
      return Response.json({ ok: false, reason: 'NOT_FOUND', message: 'That request is no longer available.' }, { status: 404 });
    }

    if (record.status === 'executed') {
      return Response.json({ ok: true, duplicate: true, status: 'executed', result: record.result || {} });
    }
    if (record.status !== 'awaiting_confirmation') {
      return Response.json({ ok: false, reason: 'NOT_PENDING', message: 'That request is no longer waiting for confirmation.' }, { status: 409 });
    }
    if (!actionRequiresConfirmation(record.action_name)) {
      return Response.json({ ok: false, reason: 'NOT_CONFIRMABLE' }, { status: 400 });
    }
    const created = new Date(record.created_at || record.created_date || 0).getTime();
    if (!Number.isFinite(created) || Date.now() - created > CONFIRMATION_TTL_MS) {
      await base44.asServiceRole.entities.ConciergeAction.update(record.id, { status: 'expired' });
      return Response.json({ ok: false, reason: 'EXPIRED', message: 'That request expired. Please ask me again.' }, { status: 410 });
    }

    if (decision === 'decline') {
      await base44.asServiceRole.entities.ConciergeAction.update(record.id, {
        status: 'declined',
        declined_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, status: 'declined', reply: 'No changes were made.' });
    }

    const ctx = {
      base44,
      email,
      accountId: auth.actor.account_id,
      fullName: auth.actor.full_name || '',
      entitlement,
      sessionId: record.session_id || '',
      channel: record.channel === 'video' ? 'video' : 'text',
    };

    const outcome = await runConciergeAction(ctx, record.action_name, record.input || {}, { confirmed: true });

    await base44.asServiceRole.entities.ConciergeAction.update(record.id, {
      status: outcome.ok ? 'executed' : 'failed',
      confirmed_at: new Date().toISOString(),
      executed_at: outcome.ok ? new Date().toISOString() : undefined,
      result: outcome.data || {},
      ui: outcome.ui || null,
      error: outcome.ok ? undefined : (outcome.error || 'action_failed'),
    });

    return Response.json({
      ok: outcome.ok === true,
      status: outcome.ok ? 'executed' : 'failed',
      reply: outcome.speech,
      data: outcome.data || null,
      ui: outcome.ui || null,
      error: outcome.error || null,
    });
  } catch (error: any) {
    console.error('conciergeConfirmAction error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}