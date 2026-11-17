/**
 * empMailOAuth — connect, verify and disconnect an employee mailbox.
 *
 * Authorization is bound to one tenant, one employee and one provider by a
 * signed state token. Credentials are written server-side only; the browser
 * never receives a token, and a supplied member id is never accepted as proof
 * of identity.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolveActor, resolveTargetMember, accountFor, audit } from '../../shared/empComm/access.ts';
import { adapterFor, providerCatalog, isSupportedProvider } from '../../shared/empComm/registry.ts';
import { clientCredentials, redirectUriFor } from '../../shared/empComm/store.ts';
import { googleEmployeeCredentialStatus } from '../../shared/empComm/googleCredentials.ts';
import { signState, verifyState } from '../../shared/empComm/state.ts';
import { tenantFor } from '../../shared/empComm/tenant.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');

    if (action === 'providers') {
      return Response.json({ providers: providerCatalog() });
    }

    // The provider returns here with a code. The signed state is the credential.
    if (action === 'callback') {
      const state = await verifyState(body.state);
      if (!state) {
        return Response.json({ error: 'This authorization link expired or was tampered with. Start the connection again.' }, { status: 400 });
      }
      if (!isSupportedProvider(state.provider)) {
        return Response.json({ error: 'That mailbox provider is not supported.' }, { status: 400 });
      }
      if (!body.code) return Response.json({ error: 'The provider did not return an authorization code.' }, { status: 400 });

      const member = await base44.asServiceRole.entities.SalesTeamMember.get(state.sales_member_id).catch(() => null);
      if (!member) return Response.json({ error: 'That employee record was not found.' }, { status: 404 });
      if (tenantFor(member) !== state.tenant_id) {
        return Response.json({ error: 'This authorization belongs to a different company.' }, { status: 403 });
      }

      const adapter = adapterFor(state.provider);
      const credentials = await clientCredentials(state.provider);
      let tokens;
      try {
        tokens = await adapter.exchangeCode({ code: body.code, redirectUri: redirectUriFor(state.provider), ...credentials });
      } catch (error) {
        await audit(base44, {
          action: 'connect',
          actor_member_id: member.id,
          provider: state.provider,
          result: 'error',
          detail: error?.message || '',
        });
        return Response.json({ error: error?.message || 'The provider rejected this authorization.' }, { status: 400 });
      }

      const profile = await adapter.profile(tokens.access_token).catch(() => ({ email: '', name: '' }));
      if (!profile.email) {
        return Response.json({ error: 'The provider did not return a mailbox address for this account.' }, { status: 400 });
      }

      const existing = await accountFor(base44, member.id, state.provider);
      const payload = {
        tenant_id: tenantFor(member),
        sales_member_id: member.id,
        provider: state.provider,
        email_address: profile.email,
        display_name: profile.name || profile.email,
        status: 'connected',
        scopes: String(tokens.scope || '').split(/[\s,]+/).filter(Boolean),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || existing?.refresh_token || '',
        token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        mail_enabled: true,
        calendar_enabled: true,
        last_sync_at: new Date().toISOString(),
        last_error: '',
        connected_by: state.sales_member_id,
        connected_at: new Date().toISOString(),
        revoked_at: null,
      };

      const saved = existing
        ? await base44.asServiceRole.entities.EmployeeEmailAccount.update(existing.id, payload)
        : await base44.asServiceRole.entities.EmployeeEmailAccount.create(payload);

      await audit(base44, {
        action: 'connect',
        actor_member_id: member.id,
        provider: state.provider,
        account_id: saved.id,
        target: profile.email,
        result: 'success',
      });

      return Response.json({
        success: true,
        provider: state.provider,
        email_address: profile.email,
        account_id: saved.id,
        return_to: state.return_to || '',
      });
    }

    const actorResult = await resolveActor(base44, req, body);
    if (!actorResult.ok) return Response.json({ error: actorResult.error }, { status: actorResult.status });
    const actor = actorResult.actor;

    // Configuration readiness for the dedicated employee Google client.
    // Never reports "connected" from credentials alone — only a real OAuth
    // round trip writes a connected mailbox account.
    if (action === 'verify_google') {
      if (!actor.isAdmin) return Response.json({ error: 'Only an administrator can verify the connection.' }, { status: 403 });
      const readiness = googleEmployeeCredentialStatus();
      let credential_pair = 'not_checked';
      let detail = '';
      if (readiness.configured) {
        try {
          const credentials = await clientCredentials('google');
          // An intentionally invalid code: Google answers invalid_grant only
          // when the client id and secret really belong together.
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code: 'arriv_one_pair_check',
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
              redirect_uri: readiness.redirect_uri,
              grant_type: 'authorization_code',
            }),
          });
          const data = await res.json().catch(() => ({}));
          const description = String(data.error_description || '');
          credential_pair =
            data.error === 'invalid_grant'
              ? 'valid'
              : data.error === 'invalid_client'
                ? (/client was not found/i.test(description) ? 'client_not_found' : 'invalid')
                : 'unknown';
          detail = description || data.error || '';
        } catch (error: any) {
          credential_pair = 'unknown';
          detail = error?.message || '';
        }
      }
      const connectedAccounts = await base44.asServiceRole.entities.EmployeeEmailAccount
        .filter({ provider: 'google', status: 'connected' })
        .catch(() => []);
      return Response.json({
        provider: 'google',
        configured: readiness.configured,
        client_id_suffix: readiness.client_id_suffix,
        redirect_uri: readiness.redirect_uri,
        credential_pair,
        detail,
        mailboxes_connected: (connectedAccounts || []).length,
      });
    }

    if (action === 'status') {
      const target = await resolveTargetMember(base44, actor, body.memberId);
      if (!target.ok) return Response.json({ error: target.error }, { status: target.status });
      const rows = await base44.asServiceRole.entities.EmployeeEmailAccount
        .filter({ tenant_id: tenantFor(target.member), sales_member_id: target.memberId })
        .catch(() => []);

      // Connection status only — never message content, and never a token.
      const accounts = (rows || []).map((row: any) => ({
        id: row.id,
        provider: row.provider,
        provider_label: (() => {
          try {
            return adapterFor(row.provider).label;
          } catch {
            return row.provider;
          }
        })(),
        email_address: row.email_address || '',
        display_name: row.display_name || '',
        status: row.status || 'pending',
        mail_enabled: row.mail_enabled !== false,
        calendar_enabled: row.calendar_enabled !== false,
        last_sync_at: row.last_sync_at || '',
        last_error: row.last_error || '',
        connected_at: row.connected_at || '',
        scopes: row.scopes || [],
      }));

      return Response.json({
        member_id: target.memberId,
        member_name: target.member.full_name || '',
        assigned_company_email: target.member.company_email || '',
        accounts,
        connected: accounts.some((a: any) => a.status === 'connected'),
        google_oauth: googleEmployeeCredentialStatus(),
        providers: providerCatalog(),
      });
    }

    if (action === 'start') {
      const provider = String(body.provider || '').toLowerCase();
      if (!isSupportedProvider(provider)) {
        return Response.json({ error: 'Choose Google Workspace or Microsoft 365.' }, { status: 400 });
      }
      const target = await resolveTargetMember(base44, actor, body.memberId);
      if (!target.ok) return Response.json({ error: target.error }, { status: target.status });

      const credentials = await clientCredentials(provider);
      const adapter = adapterFor(provider);
      const state = await signState({
        tenant_id: tenantFor(target.member),
        sales_member_id: target.memberId,
        provider,
        return_to: String(body.returnTo || ''),
      });
      const authUrl = adapter.authorizeUrl({
        ...credentials,
        redirectUri: redirectUriFor(provider),
        state,
      });
      return Response.json({ authUrl, provider, redirect_uri: redirectUriFor(provider) });
    }

    if (action === 'disconnect') {
      const target = await resolveTargetMember(base44, actor, body.memberId);
      if (!target.ok) return Response.json({ error: target.error }, { status: target.status });
      const provider = String(body.provider || '').toLowerCase();
      const account = await accountFor(base44, target.memberId, provider || undefined);
      if (!account) return Response.json({ error: 'No connected mailbox was found.' }, { status: 404 });

      // Only the owner or a company administrator may revoke a connection.
      if (actor.memberId !== target.memberId && !actor.isAdmin) {
        return Response.json({ error: 'You can only disconnect your own mailbox.' }, { status: 403 });
      }

      await base44.asServiceRole.entities.EmployeeEmailAccount.update(account.id, {
        status: 'revoked',
        access_token: '',
        refresh_token: '',
        token_expires_at: null,
        revoked_at: new Date().toISOString(),
        last_error: '',
      });
      await audit(base44, {
        action: 'disconnect',
        actor_member_id: actor.memberId,
        account_id: account.id,
        provider: account.provider,
        target: account.email_address,
        result: 'success',
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[empMailOAuth]', error?.message);
    return Response.json({ error: error?.message || 'The connection could not be completed.' }, { status: 500 });
  }
}