import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Paperclip, Send, Loader2, Clock, X, FileText } from 'lucide-react';
import {
  empComm,
  fileToAttachment,
  uploadDraftAttachments,
  loadDraftAttachments,
} from '@/lib/empCommClient';

const gold = '#B8956A';

const blank = { to: '', cc: '', bcc: '', subject: '', html: '' };

const fromDraft = (draft) => ({
  to: (draft?.to_emails || []).join(', '),
  cc: (draft?.cc_emails || []).join(', '),
  bcc: '',
  subject: draft?.subject === '(no subject)' ? '' : draft?.subject || '',
  html: draft?.body_html || '',
});

/**
 * Compose, reply or forward through the employee's own authorized mailbox.
 * Sending and scheduling are separate, explicit actions — a scheduled message is
 * never quietly downgraded to an immediate send, and vice versa.
 */
export default function EmailComposePanel({ memberId, templates = [], replyTo = null, draft = null, onSent, onDraftChanged }) {
  const [draftId, setDraftId] = useState(draft?.provider_message_id || '');
  const [form, setForm] = useState(() =>
    draft
      ? fromDraft(draft)
      : replyTo
      ? {
          to: replyTo.mode === 'forward' ? '' : replyTo.from_email || '',
          cc: '',
          bcc: '',
          subject: replyTo.mode === 'forward' ? `Fwd: ${replyTo.subject}` : `Re: ${String(replyTo.subject).replace(/^Re:\s*/i, '')}`,
          html: replyTo.quote ? `<p></p><hr/><div style="color:#666;font-size:12px">${replyTo.quote}</div>` : '',
        }
      : { ...blank }
  );
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendAt, setSendAt] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);

  // Opening a different draft refills the form instead of showing the old text.
  useEffect(() => {
    if (!draft?.provider_message_id) return;
    setDraftId(draft.provider_message_id);
    setForm(fromDraft(draft));
    setStatus('');
    setError('');
  }, [draft?.provider_message_id]);

  // A saved draft brings its files back with it, so nothing has to be re-attached.
  useEffect(() => {
    const stored = draft?.attachments || [];
    if (!stored.length) {
      setAttachments([]);
      return;
    }
    let cancelled = false;
    setLoadingAttachments(true);
    loadDraftAttachments(stored)
      .then((loaded) => {
        if (!cancelled) setAttachments(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Some attachments could not be reopened.');
      })
      .finally(() => {
        if (!cancelled) setLoadingAttachments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft?.provider_message_id]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const addFiles = async (fileList) => {
    setError('');
    const files = Array.from(fileList || []);
    const added = [];
    for (const file of files) {
      try {
        // The browser file is kept so a draft can persist it to private storage.
        added.push({ ...(await fileToAttachment(file)), sourceFile: file });
      } catch (err) {
        setError(err.message);
      }
    }
    setAttachments((prev) => [...prev, ...added].slice(0, 10));
  };

  const insertTemplate = (template) => {
    setForm((prev) => ({
      ...prev,
      subject: prev.subject || template.subject || '',
      html: `${prev.html || ''}${prev.html ? '<br/>' : ''}${template.body_html || ''}`,
    }));
  };

  const send = async () => {
    setSending(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        memberId,
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject,
        html: form.html,
        attachments,
        draftId,
      };
      if (replyTo?.mode === 'reply') {
        await empComm.reply({
          ...payload,
          messageId: replyTo.provider_message_id,
          threadId: replyTo.thread_id,
          inReplyTo: replyTo.internet_message_id || '',
          references: replyTo.references || replyTo.internet_message_id || '',
          replyAll: !!replyTo.replyAll,
        });
      } else if (replyTo?.mode === 'forward') {
        await empComm.forward({ ...payload, messageId: replyTo.provider_message_id });
      } else {
        await empComm.send(payload);
      }
      setStatus('Sent from your own mailbox.');
      setForm({ ...blank });
      setAttachments([]);
      setDraftId('');
      onSent?.();
      onDraftChanged?.();
    } catch (err) {
      setError(err.message || 'The email could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const schedule = async () => {
    if (!sendAt) {
      setError('Choose when this email should send.');
      return;
    }
    setScheduleBusy(true);
    setError('');
    try {
      await empComm.schedule({
        memberId,
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject,
        html: form.html,
        attachments,
        threadId: replyTo?.thread_id || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        send_at: new Date(sendAt).toISOString(),
      });
      setStatus('Scheduled. It will send from your mailbox at the chosen time.');
      setScheduleOpen(false);
      setSendAt('');
      onSent?.();
    } catch (err) {
      setError(err.message || 'The email could not be scheduled.');
    } finally {
      setScheduleBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!form.subject.trim() && !form.html.trim() && !form.to.trim()) {
      setError('Write something before saving a draft.');
      return;
    }
    setDraftBusy(true);
    setError('');
    setStatus('');
    try {
      // Attachments are part of the draft, not a separate afterthought.
      const savedAttachments = await uploadDraftAttachments(attachments);
      setAttachments((prev) =>
        prev.map((item, index) => ({ ...item, file_uri: savedAttachments[index]?.file_uri || item.file_uri }))
      );
      const data = await empComm.saveDraft({
        memberId,
        draftId,
        to: form.to,
        cc: form.cc,
        subject: form.subject,
        html: form.html,
        attachments: savedAttachments,
        threadId: replyTo?.thread_id || '',
      });
      setDraftId(data?.draft?.provider_message_id || draftId);
      setStatus('Saved to Drafts.');
      onDraftChanged?.();
    } catch (err) {
      setError(err.message || 'The draft could not be saved.');
    } finally {
      setDraftBusy(false);
    }
  };

  const discardDraft = async () => {
    if (!draftId) return;
    if (!window.confirm('Discard this draft?')) return;
    setDraftBusy(true);
    setError('');
    try {
      await empComm.discardDraft({ memberId, draftId });
      setDraftId('');
      setForm({ ...blank });
      setAttachments([]);
      setStatus('Draft discarded.');
      onDraftChanged?.();
    } catch (err) {
      setError(err.message || 'The draft could not be discarded.');
    } finally {
      setDraftBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {replyTo && (
        <p className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(184,149,106,0.1)', color: '#1A1A1A' }}>
          {replyTo.mode === 'forward' ? 'Forwarding' : replyTo.replyAll ? 'Replying to all' : 'Replying to'} “{replyTo.subject}”
        </p>
      )}

      {templates.length > 0 && !replyTo && (
        <div className="flex flex-wrap gap-1.5">
          {templates.slice(0, 8).map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => insertTemplate(template)}
              className="rounded-full border px-2.5 py-1 text-[11px] transition hover:opacity-80"
              style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#1A1A1A' }}
            >
              {template.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">To</Label>
          <Input value={form.to} onChange={(e) => update('to', e.target.value)} placeholder="name@company.com" className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Cc</Label>
          <Input value={form.cc} onChange={(e) => update('cc', e.target.value)} placeholder="Optional" className="mt-1 h-9 text-sm" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Subject</Label>
        <Input value={form.subject} onChange={(e) => update('subject', e.target.value)} className="mt-1 h-9 text-sm" />
      </div>

      <div>
        <Label className="text-xs">Message</Label>
        <Textarea
          value={form.html}
          onChange={(e) => update('html', e.target.value)}
          rows={10}
          placeholder="Write your message…"
          className="mt-1 text-sm"
        />
      </div>

      {loadingAttachments && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reopening saved attachments…
        </p>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((file, index) => (
            <div key={`${file.filename}-${index}`} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'rgba(184,149,106,0.25)' }}>
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: gold }} /> {file.filename}
              </span>
              <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {scheduleOpen && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
          <Label className="text-xs">Send at</Label>
          <Input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="mt-1 h-9 text-sm" />
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(26,26,26,0.5)' }}>
            Sent from your connected mailbox at this time, in your device time zone.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {status && <p className="text-xs text-emerald-700">{status}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={send} disabled={sending} className="gap-1.5" style={{ backgroundColor: gold, color: '#1A1A1A' }}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Sending…' : 'Send now'}
        </Button>
        <Button variant="outline" onClick={saveDraft} disabled={draftBusy} className="gap-1.5">
          {draftBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Save draft
        </Button>
        {draftId && (
          <Button variant="ghost" onClick={discardDraft} disabled={draftBusy} className="gap-1.5 text-red-600">
            <X className="h-4 w-4" /> Discard
          </Button>
        )}
        <Button variant="outline" onClick={() => setScheduleOpen((prev) => !prev)} className="gap-1.5">
          <Clock className="h-4 w-4" /> Schedule
        </Button>
        {scheduleOpen && (
          <Button onClick={schedule} disabled={scheduleBusy} variant="outline" className="gap-1.5">
            {scheduleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Confirm schedule
          </Button>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs" style={{ borderColor: 'rgba(184,149,106,0.35)', color: '#1A1A1A' }}>
          <Paperclip className="h-3.5 w-3.5" /> Attach
          <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
      <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.45)' }}>
        Sent from your own connected mailbox. Company transactional email is separate and never used here.
      </p>
    </div>
  );
}