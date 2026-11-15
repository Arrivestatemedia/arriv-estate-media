import React, { useRef, useState } from 'react';
import { Loader2, Mic, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { arrivOne, uploadVoiceCommand } from '@/lib/arrivOneClient';
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

  const interpret = async () => {
    const command = text.trim();
    if (!command) return;
    setInterpreting(true);
    setError('');
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