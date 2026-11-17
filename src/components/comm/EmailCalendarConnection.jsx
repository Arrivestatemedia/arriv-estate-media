import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, Mail, RefreshCw, Unplug } from 'lucide-react';
import { empComm } from '@/lib/empCommClient';

const gold = '#B8956A';

/**
 * Email & Calendar Connection — one employee, one provider, one honest status.
 * Shows what is actually connected, when it last synced, and any permission error.
 */
export default function EmailCalendarConnection({ member, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const memberId = member?.id;

  const load = async () => {
    if (!memberId) return;
    setLoading(true);
    setError('');
    try {
      setData(await empComm.status(memberId));
    } catch (err) {
      setError(err.message || 'The connection status could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [memberId]);

  const connect = async (provider) => {
    setBusy(provider);
    setError('');
    try {
      const { authUrl } = await empComm.connectUrl(provider, memberId, '/AdminSalesSignup');
      window.location.href = authUrl;
    } catch (err) {
      setError(err.message || 'The authorization could not be started.');
      setBusy('');
    }
  };

  const disconnect = async (provider) => {
    if (!window.confirm('Disconnect this mailbox? Arriv One will not be able to send or read email for this employee until it is reconnected.')) return;
    setBusy('disconnect');
    setError('');
    try {
      await empComm.disconnect(provider, memberId);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err.message || 'The mailbox could not be disconnected.');
    } finally {
      setBusy('');
    }
  };

  if (!memberId) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm" style={{ color: 'rgba(26,26,26,0.55)' }}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: gold }} /> Checking mailbox connection…
      </div>
    );
  }

  const accounts = data?.accounts || [];
  const connected = data?.connected;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: 'rgba(184,149,106,0.06)' }}>
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>
          Assigned company email
        </p>
        <p className="mt-1 text-sm font-medium" style={{ color: '#1A1A1A' }}>
          {data?.assigned_company_email || 'Not set on this employee record'}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: 'rgba(26,26,26,0.5)' }}>
          This address is a profile value only until the mailbox below is authorized.
        </p>
      </div>

      {!connected && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-medium text-amber-900">Google Workspace account connection required.</p>
            <p className="mt-0.5 text-xs text-amber-800">
              Email and calendar stay unavailable for this employee until they authorize their own company mailbox.
              Nothing is sent from another person's address in the meantime.
            </p>
          </div>
        </div>
      )}

      {accounts.map((account) => (
        <div key={account.id} className="rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: '#1A1A1A' }}>
                <Mail className="h-3.5 w-3.5" style={{ color: gold }} />
                {account.email_address || 'No address returned'}
                {account.status === 'connected' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                )}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>
                {account.provider_label}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(26,26,26,0.5)' }}>
                {account.last_sync_at ? `Last sync ${new Date(account.last_sync_at).toLocaleString()}` : 'Never synced'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] capitalize">{account.status}</Badge>
                <Badge variant="outline" className="text-[10px]">
                  {account.mail_enabled ? 'Gmail/Mail authorized' : 'Mail not authorized'}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {account.calendar_enabled ? 'Calendar authorized' : 'Calendar not authorized'}
                </Badge>
              </div>
              {account.last_error && (
                <p className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">{account.last_error}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => connect(account.provider)}
                disabled={busy === account.provider}
                className="gap-1.5"
              >
                {busy === account.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reconnect
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => disconnect(account.provider)}
                disabled={busy === 'disconnect'}
                className="gap-1.5"
                style={{ borderColor: 'rgba(220,38,38,0.3)', color: '#dc2626' }}
              >
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>
          </div>
        </div>
      ))}

      {!accounts.length && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => connect('google')} disabled={busy === 'google'} className="gap-1.5" style={{ backgroundColor: gold, color: '#1A1A1A' }}>
            {busy === 'google' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Connect Google Account
          </Button>
          <Button size="sm" variant="outline" onClick={() => connect('microsoft')} disabled={busy === 'microsoft'} className="gap-1.5">
            {busy === 'microsoft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
            Connect Microsoft 365
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}