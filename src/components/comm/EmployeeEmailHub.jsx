import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CalendarDays, Clock, Inbox, LayoutTemplate, Loader2, Mail, PenLine, RefreshCw, Search, Trash2 } from 'lucide-react';
import { empComm } from '@/lib/empCommClient';
import EmailCalendarConnection from './EmailCalendarConnection';
import EmailComposePanel from './EmailComposePanel';
import EmailMessageReader from './EmailMessageReader';
import EmailTemplateManager from './EmailTemplateManager';
import EmailCalendarPanel from './EmailCalendarPanel';

const gold = '#B8956A';

const TABS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'compose', label: 'Compose', icon: PenLine },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
  { id: 'scheduled', label: 'Scheduled', icon: Clock },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

/**
 * Employee Email Hub. Everything here runs through the employee's own connected
 * mailbox — there is no shared mailbox and no company-address fallback.
 */
export default function EmployeeEmailHub({ memberId }) {
  const [tab, setTab] = useState('inbox');
  const [connection, setConnection] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [canManageCompany, setCanManageCompany] = useState(false);
  const [messages, setMessages] = useState([]);
  const [folder, setFolder] = useState('inbox');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openMessageId, setOpenMessageId] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [scheduled, setScheduled] = useState([]);

  const connected = connection?.connected === true;

  const loadConnection = useCallback(async () => {
    if (!memberId) return;
    try {
      setConnection(await empComm.status(memberId));
    } catch (err) {
      setError(err.message || 'The mailbox status could not be loaded.');
    }
  }, [memberId]);

  const loadTemplates = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = await empComm.templates(memberId);
      setTemplates(data.templates || []);
      setCanManageCompany(!!data.can_manage_company);
    } catch (err) {
      setError(err.message || 'Templates could not be loaded.');
    }
  }, [memberId]);

  const loadMessages = useCallback(
    async (nextFolder = folder) => {
      if (!memberId) return;
      setLoading(true);
      setError('');
      try {
        const data = query.trim()
          ? await empComm.search({ memberId, query: query.trim(), folder: nextFolder })
          : await empComm.inbox({ memberId, folder: nextFolder, limit: 25 });
        setMessages(data.messages || []);
      } catch (err) {
        setError(err.message || 'Your inbox could not be loaded.');
        setMessages([]);
      } finally {
        setLoading(false);
      }
    },
    [memberId, folder, query]
  );

  const loadScheduled = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = await empComm.scheduled(memberId);
      setScheduled(data.scheduled || []);
    } catch (err) {
      setError(err.message || 'Scheduled email could not be loaded.');
    }
  }, [memberId]);

  useEffect(() => {
    loadConnection();
    loadTemplates();
  }, [loadConnection, loadTemplates]);

  useEffect(() => {
    if (connected && tab === 'inbox') loadMessages();
  }, [connected, tab, loadMessages]);

  useEffect(() => {
    if (connected && tab === 'scheduled') loadScheduled();
  }, [connected, tab, loadScheduled]);

  if (!memberId) {
    return <p className="py-6 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Select an employee to open their mailbox.</p>;
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-medium text-amber-900">Google Workspace account connection required.</p>
            <p className="mt-0.5 text-xs text-amber-800">
              The Email Hub, replies and calendar stay disabled until this employee authorizes their own mailbox.
              Arriv One will not substitute another address.
            </p>
          </div>
        </div>
        <EmailCalendarConnection member={{ id: memberId }} onUpdated={loadConnection} />
      </div>
    );
  }

  const account = (connection.accounts || []).find((item) => item.status === 'connected');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: '#1A1A1A' }}>
            <Mail className="h-4 w-4" style={{ color: gold }} /> {account?.email_address}
          </p>
          <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.5)' }}>
            {account?.provider_label} · private to this employee
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { loadConnection(); loadMessages(); }} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Sync
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setOpenMessageId(''); }}
              className="flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition"
              style={{
                color: tab === item.id ? gold : 'rgba(26,26,26,0.5)',
                borderBottomColor: tab === item.id ? gold : 'transparent',
              }}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {tab === 'inbox' && !openMessageId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: gold }} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadMessages()}
                placeholder="Search this mailbox…"
                className="h-9 pl-8 text-sm"
              />
            </div>
            {['inbox', 'sent', 'drafts', 'archive', 'trash'].map((name) => (
              <button
                key={name}
                onClick={() => { setFolder(name); loadMessages(name); }}
                className="rounded-full border px-2.5 py-1 text-[11px] capitalize"
                style={{
                  borderColor: folder === name ? gold : 'rgba(184,149,106,0.3)',
                  backgroundColor: folder === name ? 'rgba(184,149,106,0.15)' : 'transparent',
                  color: '#1A1A1A',
                }}
              >
                {name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm" style={{ color: 'rgba(26,26,26,0.55)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading mail…
            </div>
          ) : (
            <div className="space-y-1.5">
              {messages.map((message) => (
                <button
                  key={message.id}
                  onClick={() => setOpenMessageId(message.provider_message_id)}
                  className="w-full rounded-lg border p-3 text-left transition hover:opacity-80"
                  style={{ borderColor: 'rgba(184,149,106,0.2)', backgroundColor: message.is_read ? '#fff' : '#FFFBF5' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: '#1A1A1A' }}>
                      {folder === 'sent' ? `To: ${(message.to_emails || []).join(', ')}` : message.from_email}
                    </p>
                    <span className="shrink-0 text-[11px]" style={{ color: 'rgba(26,26,26,0.4)' }}>
                      {message.occurred_at ? new Date(message.occurred_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="truncate text-sm" style={{ color: 'rgba(26,26,26,0.75)' }}>{message.subject}</p>
                  <p className="truncate text-xs" style={{ color: 'rgba(26,26,26,0.45)' }}>{message.snippet}</p>
                  {message.has_attachments && <Badge variant="outline" className="mt-1 text-[10px]">attachment</Badge>}
                </button>
              ))}
              {!messages.length && (
                <p className="py-8 text-center text-sm" style={{ color: 'rgba(26,26,26,0.45)' }}>
                  Nothing in {folder} yet.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'inbox' && openMessageId && (
        <EmailMessageReader
          memberId={memberId}
          messageId={openMessageId}
          onBack={() => setOpenMessageId('')}
          onChanged={() => loadMessages()}
          onCompose={(payload) => { setReplyTo(payload); setTab('compose'); }}
        />
      )}

      {tab === 'compose' && (
        <EmailComposePanel
          memberId={memberId}
          templates={templates}
          replyTo={replyTo}
          onSent={() => { setReplyTo(null); loadMessages('sent'); }}
        />
      )}

      {tab === 'templates' && (
        <EmailTemplateManager
          memberId={memberId}
          templates={templates}
          canManageCompany={canManageCompany}
          onChanged={loadTemplates}
        />
      )}

      {tab === 'scheduled' && (
        <div className="space-y-2">
          {scheduled.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: '#1A1A1A' }}>{item.subject}</p>
                <p className="truncate text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>
                  To {(item.to_emails || []).join(', ')} · {item.send_at ? new Date(item.send_at).toLocaleString() : ''}
                </p>
                <Badge variant="outline" className="mt-1 text-[10px] capitalize">{item.status}</Badge>
                {item.last_error && <p className="mt-1 text-[11px] text-red-600">{item.last_error}</p>}
              </div>
              {item.status === 'pending' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 gap-1 text-red-600"
                  onClick={async () => {
                    if (!window.confirm('Cancel this scheduled email?')) return;
                    try {
                      await empComm.cancelScheduled({ memberId, id: item.id });
                      loadScheduled();
                    } catch (err) {
                      setError(err.message);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Cancel
                </Button>
              )}
            </div>
          ))}
          {!scheduled.length && (
            <p className="py-8 text-center text-sm" style={{ color: 'rgba(26,26,26,0.45)' }}>No scheduled emails.</p>
          )}
        </div>
      )}

      {tab === 'calendar' && <EmailCalendarPanel memberId={memberId} />}

      <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.45)' }}>
        Company transactional email (bookings, delivery, recruiting) is handled separately and is never sent from here.
      </p>
    </div>
  );
}