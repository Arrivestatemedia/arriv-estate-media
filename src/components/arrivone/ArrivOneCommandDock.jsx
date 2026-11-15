import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('arriv:open-command', show);
    return () => window.removeEventListener('arriv:open-command', show);
  }, []);

  return createPortal(
    <>
      {!open && <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Arriv One AI command"
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[10010] flex items-center gap-2 rounded-full bg-[#B8956A] px-4 py-3 text-[#1A1A1A] shadow-lg transition hover:bg-[#A68559] md:bottom-6 md:h-14 md:w-14 md:justify-center md:gap-0 md:px-0 md:py-0"
      >
        <Mic className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold md:hidden">Ask Arriv</span>
      </button>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="z-[10020]" className="z-[10021] max-h-[85dvh] max-w-lg overflow-y-auto bg-[#FFFBF5] p-4">
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
    </>, document.body
  );
}