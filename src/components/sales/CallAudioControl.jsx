import React, { useState } from 'react';
import { Check, Loader2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CallAudioControl({ outputs, selectedId, busy, onSelect }) {
  const [open, setOpen] = useState(false);
  const choose = (id) => {
    // Start selection directly in this tap, not after opening/enumerating devices.
    onSelect(id).then(success => { if (success) setOpen(false); });
  };
  return (
    <div className="relative flex flex-col items-center">
      <Button onClick={() => setOpen(!open)} variant="ghost" disabled={busy}
        aria-label="Choose call audio output" aria-expanded={open}
        className="h-14 w-14 rounded-full border border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/20">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Volume2 className="h-6 w-6" />}
      </Button>
      <span className="mt-1 text-xs">Audio</span>
      {open && (
        <div className="absolute top-full left-1/2 z-10 mt-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl" role="group" aria-label="Call audio outputs">
          <p className="px-2 py-1 text-sm font-semibold">Call audio</p>
          {outputs.length === 0 && <p className="p-2 text-sm">Outputs appear once the microphone connects.</p>}
          {outputs.map((output, index) => (
            <button key={output.deviceId} type="button" onClick={() => choose(output.deviceId)}
              disabled={busy} aria-pressed={selectedId === output.deviceId}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-3 text-left text-sm hover:bg-accent disabled:opacity-50">
              <span>{output.label || `Audio output ${index + 1}`}</span>
              {selectedId === output.deviceId && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}