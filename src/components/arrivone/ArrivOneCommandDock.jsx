import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mic } from 'lucide-react';
import ArrivOneCommandBar from '@/components/arrivone/ArrivOneCommandBar';

/**
 * Floating command entry point for every Arriv One surface. Mounted once in the
 * sales layout so the microphone is reachable from the dashboard, prospecting, a
 * prospect record, the dialer and call history without five assistants.
 */
export default function ArrivOneCommandDock() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Arriv One AI command"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#B8956A] text-[#1A1A1A] shadow-lg transition hover:bg-[#A68559] md:bottom-6"
      >
        <Mic className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-[#FFFBF5] p-4">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#1A1A1A]">Arriv One AI Command</DialogTitle>
          </DialogHeader>
          <ArrivOneCommandBar
            contextLabel="Workspace"
            onApplied={() => setOpen(false)}
            placeholder="Speak or type: “Called Michael, no answer, try again Thursday afternoon.”"
          />
          <p className="text-[11px] text-[#1A1A1A]/45">
            Every change is shown for review before it is saved. Nothing is emailed or texted automatically.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}