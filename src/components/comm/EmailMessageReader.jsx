import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Archive, Download, Loader2, Paperclip, Reply, ReplyAll, Share2, Trash2 } from 'lucide-react';
import { empComm } from '@/lib/empCommClient';

function downloadBase64(filename, base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'attachment';
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  link.remove();
}

/**
 * Full message view. The body is sanitized on the server before it reaches this
 * component, so inbound email can never run code inside Arriv One.
 */
export default function EmailMessageReader({ memberId, messageId, onBack, onCompose, onChanged }) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    empComm
      .message({ memberId, messageId })
      .then((data) => {
        if (!cancelled) setMessage(data.message);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'This message could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, messageId]);

  const act = async (action) => {
    setBusy(action);
    try {
      if (action === 'archive') await empComm.archive({ memberId, messageId });
      if (action === 'trash') {
        if (!window.confirm('Move this message to trash?')) {
          setBusy('');
          return;
        }
        await empComm.trash({ memberId, messageId });
      }
      onChanged?.();
      onBack?.();
    } catch (err) {
      setError(err.message || 'That action could not be completed.');
    } finally {
      setBusy('');
    }
  };

  const download = async (attachment) => {
    setBusy(attachment.id);
    try {
      const { content_base64 } = await empComm.attachment({
        memberId,
        messageId: message.provider_message_id,
        attachmentId: attachment.id,
      });
      downloadBase64(attachment.filename, content_base64, attachment.mime_type);
    } catch (err) {
      setError(err.message || 'That attachment could not be downloaded.');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm" style={{ color: 'rgba(26,26,26,0.55)' }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading message…
      </div>
    );
  }

  if (error && !message) {
    return (
      <div className="space-y-3 py-6">
        <p className="text-sm text-red-600">{error}</p>
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => act('archive')} disabled={busy === 'archive'} className="gap-1.5">
            {busy === 'archive' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Archive
          </Button>
          <Button variant="ghost" size="sm" onClick={() => act('trash')} disabled={busy === 'trash'} className="gap-1.5 text-red-600">
            {busy === 'trash' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </div>
      </div>

      <div>
        <h2 className="font-serif text-xl" style={{ color: '#1A1A1A' }}>{message.subject}</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
          {message.from_email}
          {message.occurred_at ? ` · ${new Date(message.occurred_at).toLocaleString()}` : ''}
        </p>
        {message.to_emails?.length > 0 && (
          <p className="text-xs" style={{ color: 'rgba(26,26,26,0.45)' }}>to {message.to_emails.join(', ')}</p>
        )}
      </div>

      {message.attachments?.length > 0 && (
        <div className="space-y-1 rounded-lg border p-2" style={{ borderColor: 'rgba(184,149,106,0.25)' }}>
          <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#1A1A1A' }}>
            <Paperclip className="h-3.5 w-3.5" /> {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
          </p>
          {message.attachments.map((attachment, index) => (
            <div key={attachment.id || index} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{attachment.filename}</span>
              <Button size="sm" variant="ghost" onClick={() => download(attachment)} disabled={busy === attachment.id} className="gap-1">
                {busy === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download
              </Button>
            </div>
          ))}
        </div>
      )}

      <div
        className="prose prose-sm max-w-none overflow-x-auto rounded-lg border p-3 text-sm"
        style={{ borderColor: 'rgba(184,149,106,0.2)', color: '#1A1A1A' }}
        dangerouslySetInnerHTML={{ __html: message.body_html || `<pre style="white-space:pre-wrap">${message.body_text || ''}</pre>` }}
      />

      {message.contact_id && (
        <Badge variant="outline" className="text-[10px]">Linked to a CRM contact</Badge>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onCompose({ mode: 'reply', ...message, from_email: message.from_email })} className="gap-1.5" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
          <Reply className="h-4 w-4" /> Reply
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCompose({ mode: 'reply', replyAll: true, ...message })} className="gap-1.5">
          <ReplyAll className="h-4 w-4" /> Reply all
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCompose({ mode: 'forward', ...message })} className="gap-1.5">
          <Share2 className="h-4 w-4" /> Forward
        </Button>
      </div>
    </div>
  );
}