import React from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CallScriptPrompt — mobile only.
 * Shown when a call is placed to a number that belongs to a client already in
 * the system, offering the call script for that client.
 */
export default function CallScriptPrompt({ clientName, onShowScript, onDismiss }) {
  return (
    <div className="fixed inset-0 z-[72] bg-black/50 flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5" style={{ color: "#B8956A" }} />
          <p className="font-semibold" style={{ color: "#1A1A1A" }}>You're placing a call</p>
        </div>
        <p className="text-sm mb-4" style={{ color: "rgba(26,26,26,0.7)" }}>
          {clientName} is in your contacts. Would you like to see a script based on this client?
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss}>
            Not now
          </Button>
          <Button
            className="flex-1"
            style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
            onClick={onShowScript}
          >
            Show script
          </Button>
        </div>
      </div>
    </div>
  );
}