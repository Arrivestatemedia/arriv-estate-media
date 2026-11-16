import React, { useRef, useState } from 'react';
import { Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { arrivOne, uploadVoiceCommand } from '@/lib/arrivOneClient';
import { empComm } from '@/lib/empCommClient';
import CommandReviewSheet from '@/components/arrivone/CommandReviewSheet';

/**
 * One command surface for every Arriv One page. The same component is mounted on
 * the dashboard, prospecting, prospect detail, the dialer and call history, so a
 * representative learns one interaction instead of five.
 */
export default function ArrivOneCommandBar({ contextLabel = 'Arriv One', onApplied, placeholder, compact = false }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [execution, setExecution] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [comm, setComm] = useState(null);
  const [commBusy, setCommBusy] = useState('');
  const [commProposal, setCommProposal] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const stopTracks = () => {
    (streamRef.current?.getTracks?.() || []).forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startListening = async () => {
    setError('');
    if (!navigator?.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This device cannot record audio. Type the command instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setListening(false);
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        setTranscribing(true);
        try {
          const file_uri = await uploadVoiceCommand(blob);
          const { transcript } = await arrivOne.transcribe({ file_uri });
          setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        } catch (err) {
          setError(err.message || 'That recording could not be transcribed.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setListening(true);
    } catch {
      setError('Microphone access was blocked. Type the command instead.');
    }
  };

  const stopListening = () => {
    try {
      recorderRef.current?.stop();
    } catch {
      setListening(false);
      stopTracks();
    }
  };

  // One panel, two capabilities: CRM writes keep their review sheet, while an
  // email or calendar request comes back as a proposal that must be confirmed.
  // A request to *find* an address is CRM research, not mailbox work. Without
  // this gate the word "email" alone sent lookups to the mailbox assistant.
  const COMM_PATTERN = /\b(e-?mails?|inbox|meeting|calendar|schedule|invite|availability|reply|forward)\b/i;
  const LOOKUP_PATTERN = /\b(find|locate|look(?:ing)?\s*(?:up|for)?|search(?:ing)?|get|pull|what(?:'s| is)|do (?:you|we) have)\b[\s\S]{0,48}\b(e-?mail|address|contact (?:info|details)|number)\b/i;
  const OWN_INBOX_PATTERN = /\bmy\s+(e-?mail|emails|inbox)\b/i;

  const interpret = async () => {
    const command = text.trim();
    if (!command) return;
    setError('');
    setComm(null);
    setCommProposal(null);

    const isLookup = LOOKUP_PATTERN.test(command) && !OWN_INBOX_PATTERN.test(command);

    if (!isLookup && COMM_PATTERN.test(command)) {
      setInterpreting(true);
      try {
        const data = await empComm.comm(command);
        setComm(data);
        if (data.needs_confirmation) setCommProposal({ ...(data.proposal || {}) });
      } catch (err) {
        setError(err.message || 'Arriv One could not reach your mailbox.');
      } finally {
        setInterpreting(false);
      }
      return;
    }

    setInterpreting(true);
    try {
      const data = await arrivOne.interpret({ text: command, source: 'text' });
      setExecution(data.execution);
      setSheetOpen(true);
    } catch (err) {
      setError(err.message || 'Arriv One could not read that command.');
    } finally {
      setInterpreting(false);
    }
  };

  const confirmComm = async () => {
    if (!commProposal) return;
    setCommBusy('send');
    setError('');
    try {
      if (commProposal.kind === 'meeting') {
        await empComm.createEvent({
          title: commProposal.title,
          description: '',
          location: '',
          start_at: commProposal.start_at,
          end_at: commProposal.end_at,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          attendees: commProposal.attendees || [],
          confirmed: true,
        });
        toast.success('Meeting created on your calendar');
      } else if (comm?.intent === 'email_schedule' && commProposal.send_at) {
        await empComm.schedule({
          to: commProposal.to,
          subject: commProposal.subject,
          html: commProposal.html,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          send_at: commProposal.send_at,
        });
        toast.success('Email scheduled from your mailbox');
      } else {
        await empComm.send({
          to: commProposal.to,
          subject: commProposal.subject,
          html: commProposal.html,
        });
        toast.success('Email sent from your mailbox');
      }
      setComm(null);
      setCommProposal(null);
      setText('');
      onApplied?.({});
    } catch (err) {
      setError(err.message || 'That action could not be completed.');
    } finally {
      setCommBusy('');
    }
  };

  const busy = transcribing || interpreting;

  return (
    <div className="rounded-2xl border border-[#B8956A]/30 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">
          <Sparkles className="h-3.5 w-3.5 text-[#B8956A]" /> AI Command · {contextLabel}
        </p>
        {listening && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Listening
          </span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={busy}
          aria-label={listening ? 'Stop recording' : 'Speak a command'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
            listening ? 'bg-red-500 text-white' : 'bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]'
          } ${busy ? 'opacity-60' : ''}`}
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                interpret();
              }
            }}
            placeholder={
              placeholder ||
              'e.g. Add Jennifer Williams, realtor in Rockville Maryland, 301-555-0142, interested in the $275 package, follow up Tuesday'
            }
            className="h-11 bg-[#FFFBF5] text-sm"
          />
        </div>

        <Button
          onClick={interpret}
          disabled={busy || !text.trim()}
          className="h-11 bg-[#1A1A1A] px-4 text-[#FFFBF5] hover:bg-[#1A1A1A]/90"
        >
          {interpreting ? <Loader2 className="h-4 w-4 animate-spin" /> : compact ? 'Go' : 'Review'}
        </Button>
      </div>

      {(transcribing || error) && (
        <p className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-[#1A1A1A]/50'}`}>
          {error || 'Transcribing your command…'}
        </p>
      )}

      {comm && (
        <div className="mt-3 space-y-2 rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5] p-3">
          {comm.read_only && (
            <>
              <p className="text-xs font-medium text-[#1A1A1A]">{comm.summary}</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {(comm.messages || []).map((row, index) => (
                  <div key={index} className="rounded border border-[#1A1A1A]/10 bg-white p-2 text-[11px] text-[#1A1A1A]">
                    <p className="font-medium">{row.subject}</p>
                    <p className="text-[#1A1A1A]/55">{row.from || row.to} · {row.snippet}</p>
                  </div>
                ))}
                {(comm.events || []).map((row, index) => (
                  <div key={index} className="rounded border border-[#1A1A1A]/10 bg-white p-2 text-[11px] text-[#1A1A1A]">
                    <p className="font-medium">{row.title}</p>
                    <p className="text-[#1A1A1A]/55">{row.start_at ? new Date(row.start_at).toLocaleString() : ''}</p>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setComm(null); setCommProposal(null); }}>Close</Button>
            </>
          )}

          {comm.needs_confirmation && commProposal && (
            <>
              <p className="text-xs font-medium text-[#1A1A1A]">
                {commProposal.kind === 'meeting' ? 'Review this invitation' : 'Review this email'}
              </p>
              {commProposal.kind === 'meeting' ? (
                <div className="space-y-2 text-[11px] text-[#1A1A1A]">
                  <Input value={commProposal.title} onChange={(event) => setCommProposal({ ...commProposal, title: event.target.value })} placeholder="Meeting title" className="h-9 bg-white text-sm" />
                  <p className="text-[#1A1A1A]/60">
                    {commProposal.start_at ? new Date(commProposal.start_at).toLocaleString() : 'Time not understood'} ·{' '}
                    {(commProposal.attendees || []).join(', ') || 'no verified attendee'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input value={commProposal.to} onChange={(event) => setCommProposal({ ...commProposal, to: event.target.value })} placeholder="Recipient" className="h-9 bg-white text-sm" />
                  <Input value={commProposal.subject} onChange={(event) => setCommProposal({ ...commProposal, subject: event.target.value })} placeholder="Subject" className="h-9 bg-white text-sm" />
                  <textarea
                    value={commProposal.html}
                    onChange={(event) => setCommProposal({ ...commProposal, html: event.target.value })}
                    rows={5}
                    className="w-full rounded-md border border-[#1A1A1A]/15 bg-white p-2 text-sm text-[#1A1A1A]"
                    placeholder="Message"
                  />
                </div>
              )}
              {(comm.warnings || []).length > 0 && (
                <ul className="space-y-1">
                  {comm.warnings.map((warning, index) => (
                    <li key={index} className="text-[11px] text-amber-800">• {warning}</li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={confirmComm} disabled={!!commBusy} className="bg-[#B8956A] text-[#1A1A1A]">
                  {commBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : commProposal.kind === 'meeting' ? 'Confirm & invite' : comm?.intent === 'email_schedule' ? 'Confirm & schedule' : 'Confirm & send'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setComm(null); setCommProposal(null); }} disabled={!!commBusy}>Cancel</Button>
              </div>
            </>
          )}

          {!comm.read_only && !comm.needs_confirmation && (
            <>
              <p className="text-xs text-[#1A1A1A]/70">{comm.summary || 'No email or calendar action was recognised.'}</p>
              <Button size="sm" variant="outline" onClick={() => setComm(null)}>Close</Button>
            </>
          )}
        </div>
      )}

      <CommandReviewSheet
        open={sheetOpen}
        execution={execution}
        onClose={() => {
          setSheetOpen(false);
          setExecution(null);
        }}
        onApplied={(response) => {
          setText('');
          const name = response?.result?.contact?.name;
          toast.success(name ? `Saved ${name}` : 'Arriv One saved your changes');
          onApplied?.(response);
        }}
      />
    </div>
  );
}