/**
 * Mailbox token handling and message persistence.
 *
 * Tokens live only on the server-side account record. This module is the single
 * place that refreshes them, so every provider call uses a valid credential and
 * an expired authorization is reported instead of silently falling back.
 */

import { adapterFor } from './registry.ts';
import { audit } from './access.ts';
import { tenantFor } from './tenant.ts';
import { googleEmployeeCredentials, EMP_COMM_GOOGLE_REDIRECT_URI } from './googleCredentials.ts';

export async function clientCredentials(provider: string) {
  if (provider === 'google') {
    // The employee layer owns its own Google client, so no other Google
    // integration is affected by this connection or its rotation.
    return googleEmployeeCredentials();
  }
  if (provider === 'microsoft') {
    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('Microsoft 365 sign-in is not configured for this app.');
    return { clientId, clientSecret };
  }
  throw new Error('That mailbox provider is not supported.');
}

export function redirectUriFor(provider: string) {
  const base = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
  // Google is pinned to the one URI registered on the employee OAuth client;
  // Microsoft keeps the redirect it already has registered.
  return provider === 'google'
    ? EMP_COMM_GOOGLE_REDIRECT_URI
    : `${base}/SalesRepMicrosoftAuthCallback`;
}

/** A usable access token, refreshed when it is close to expiring. */
export async function accessTokenFor(base44: any, account: any) {
  const adapter = adapterFor(account.provider);
  const credentials = await clientCredentials(account.provider);
  const expires = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && expires - Date.now() > 60000) return account.access_token;

  if (!account.refresh_token) {
    throw new Error('This mailbox authorization has expired and cannot be renewed. Reconnect the account.');
  }
  try {
    const refreshed = await adapter.refresh({
      refreshToken: account.refresh_token,
      ...credentials,
    });
    await base44.asServiceRole.entities.EmployeeEmailAccount.update(account.id, {
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
      ...(refreshed.refresh_token && refreshed.refresh_token !== account.refresh_token
        ? { refresh_token: refreshed.refresh_token }
        : {}),
      status: 'connected',
      last_error: '',
    });
    return refreshed.access_token;
  } catch (error: any) {
    await base44.asServiceRole.entities.EmployeeEmailAccount.update(account.id, {
      status: 'error',
      last_error: error?.message || 'Authorization refresh failed.',
    }).catch(() => {});
    await audit(base44, {
      action: 'refresh_failed',
      account_id: account.id,
      provider: account.provider,
      result: 'error',
      detail: error?.message || '',
    });
    throw new Error(error?.message || 'This mailbox needs to be reconnected.');
  }
}

/**
 * Stores one provider message, keyed by account + provider message id so a
 * retried sync can never create a duplicate.
 */
export async function upsertMessage(base44: any, account: any, member: any, message: any) {
  const existing: any[] = await base44.asServiceRole.entities.EmployeeMessage
    .filter({ account_id: account.id, provider_message_id: message.provider_message_id }, { limit: 1 })
    .catch(() => []);
  const payload = {
    tenant_id: tenantFor(member),
    account_id: account.id,
    sales_member_id: account.sales_member_id,
    provider: account.provider,
    provider_message_id: message.provider_message_id,
    thread_id: message.thread_id || '',
    direction: message.direction || (message.folder === 'sent' ? 'outbound' : 'inbound'),
    folder: message.folder || 'inbox',
    from_email: message.from_email || '',
    from_name: message.from_name || '',
    to_emails: message.to_emails || [],
    cc_emails: message.cc_emails || [],
    subject: message.subject || '(no subject)',
    snippet: message.snippet || '',
    body_html: message.body_html || '',
    body_text: message.body_text || '',
    occurred_at: message.occurred_at || new Date().toISOString(),
    is_read: !!message.is_read,
    is_archived: message.folder === 'archive',
    has_attachments: !!message.has_attachments,
    attachments: message.attachments || [],
  };
  if (existing[0]) {
    await base44.asServiceRole.entities.EmployeeMessage.update(existing[0].id, payload);
    return { ...existing[0], ...payload };
  }
  return await base44.asServiceRole.entities.EmployeeMessage.create(payload);
}

/** Finds the CRM contact an address belongs to, so activity is attributed. */
export async function contactForAddress(base44: any, email: string) {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return null;
  const rows: any[] = await base44.asServiceRole.entities.Contact
    .filter({ email_normalized: address }, { limit: 1 })
    .catch(() => []);
  if (rows[0]) return rows[0];
  const fallback: any[] = await base44.asServiceRole.entities.Contact
    .filter({ email: address }, { limit: 1 })
    .catch(() => []);
  return fallback[0] || null;
}

/**
 * One CRM activity per message. The provider message id is the idempotency key,
 * so a retried send or re-synced inbox never logs twice.
 */
export async function logCrmActivity(base44: any, { member, account, message, contact, kind }: any) {
  const key = `${account.provider}:${message.provider_message_id || message.thread_id || ''}`;
  const existing: any[] = await base44.asServiceRole.entities.ActivityLog
    .filter({ sales_member_id: member.id, notes: { $regex: key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }, { limit: 1 })
    .catch(() => []);
  if (existing[0]) return existing[0];

  const address = kind === 'inbound' ? message.from_email : (message.to_emails || [])[0] || '';
  return await base44.asServiceRole.entities.ActivityLog.create({
    activity_type: 'email',
    contact_name: contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : '',
    contact_email: address,
    company_name: contact?.company || '',
    activity_date: message.occurred_at || new Date().toISOString(),
    notes: `${kind === 'inbound' ? 'Email received' : 'Email sent'} · ${message.subject || '(no subject)'}\n\n${message.body_text || ''}`.slice(
      0,
      4000
    ) + `\n\n[ref ${key}]`,
    direction: kind === 'inbound' ? 'incoming' : 'outgoing',
    sales_member_id: member.id,
    sales_member_email: account.email_address,
  });
}