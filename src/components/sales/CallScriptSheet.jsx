import React from "react";
import ReactMarkdown from "react-markdown";
import { Phone, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * CallScriptSheet — mobile only.
 * Full-screen call map shown over an in-progress call.
 */
export default function CallScriptSheet({ clientName, callMap, loading, onGenerate, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[73] bg-white flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="flex items-center gap-2 px-4 h-14 border-b shrink-0"
        style={{ borderColor: "rgba(184,149,106,0.25)" }}
      >
        <Phone className="w-4 h-4" style={{ color: "#B8956A" }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: "#1A1A1A" }}>Call Script</p>
          {clientName && <p className="text-xs truncate" style={{ color: "rgba(26,26,26,0.5)" }}>{clientName}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#B8956A" }} />
            <p className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>Building your script...</p>
          </div>
        ) : callMap ? (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: "rgba(184,149,106,0.05)", border: "1px solid rgba(184,149,106,0.2)" }}
          >
            <ReactMarkdown
              className="prose prose-sm max-w-none text-sm leading-relaxed"
              components={{
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold mt-4 mb-1.5 first:mt-0" style={{ color: "#1A1A1A" }}>{children}</h3>
                ),
                p: ({ children }) => <p className="my-1.5 leading-relaxed" style={{ color: "#1A1A1A" }}>{children}</p>,
                strong: ({ children }) => <strong className="font-semibold" style={{ color: "#1A1A1A" }}>{children}</strong>,
                hr: () => <hr className="my-3" style={{ borderColor: "rgba(184,149,106,0.2)" }} />,
                ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
                li: ({ children }) => <li className="text-sm" style={{ color: "#1A1A1A" }}>{children}</li>,
              }}
            >
              {callMap}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-center py-16">
            <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: "#B8956A" }} />
            <p className="text-sm mb-4" style={{ color: "rgba(26,26,26,0.6)" }}>
              No script on file for this client yet.
            </p>
            <Button onClick={onGenerate} style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}>
              <Sparkles className="w-4 h-4 mr-2" /> Build script
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}