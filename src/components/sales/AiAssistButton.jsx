import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AiAssistButton
 * 
 * Props:
 *  - mode: "email" | "chat" | "call"
 *  - context: object with context info (contactName, subject, recentMessages, etc.)
 *  - onInsert: (text: string) => void  — called when user clicks "Use This"
 */
export default function AiAssistButton({ mode, context = {}, onInsert }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const modeConfig = {
    email: {
      label: "AI Draft",
      prompt: buildEmailPrompt(context),
      placeholder: "Drafting email...",
    },
    chat: {
      label: "AI Reply",
      prompt: buildChatPrompt(context),
      placeholder: "Generating reply...",
    },
    call: {
      label: "Call Script",
      prompt: buildCallPrompt(context),
      placeholder: "Generating script...",
    },
  };

  const config = modeConfig[mode];

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: config.prompt,
      });
      setResult(typeof res === "string" ? res : res?.text || String(res));
    } catch (e) {
      setResult("Failed to generate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setResult(null);
    generate();
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUse = () => {
    if (result && onInsert) {
      onInsert(result);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition hover:opacity-80"
        style={{ backgroundColor: 'rgba(184,149,106,0.12)', color: '#B8956A' }}
        title={config.label}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {config.label}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: '#B8956A' }} />
                <span className="font-semibold text-gray-900">{config.label}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
                  <p className="text-sm text-gray-500">{config.placeholder}</p>
                </div>
              ) : result ? (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{result}</pre>
              ) : null}
            </div>

            {/* Actions */}
            {result && !loading && (
              <div className="border-t px-5 py-4 flex gap-2">
                <Button
                  onClick={generate}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                {onInsert && (
                  <Button
                    onClick={handleUse}
                    size="sm"
                    className="flex-1 gap-1"
                    style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                  >
                    Use This
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function buildEmailPrompt({ contactName, contactCompany, subject, existingBody, repName }) {
  return `You are a professional real estate media sales representative at Arriv, a company that provides real estate photography, videography, and media services.

Write a concise, professional sales email with the following context:
- Recipient: ${contactName || "the contact"}${contactCompany ? ` at ${contactCompany}` : ""}
- Subject: ${subject || "follow-up"}
- Sender: ${repName || "an Arriv sales rep"}
${existingBody ? `- Existing draft to improve: ${existingBody}` : ""}

Write only the email body (no subject line, no "Subject:" prefix). Be warm, professional, and focused on the value Arriv provides. Keep it under 150 words.`;
}

function buildChatPrompt({ recipientName, recentMessages, repName }) {
  const msgHistory = recentMessages?.slice(-4).map(m => `${m.sender_name}: ${m.content}`).join("\n") || "";
  return `You are a professional sales rep at Arriv (real estate media company). Suggest a concise, friendly internal team chat reply.

${msgHistory ? `Recent conversation:\n${msgHistory}\n` : ""}
Recipient: ${recipientName || "a teammate"}
Your name: ${repName || "the rep"}

Write only the reply message. Keep it short, clear, and professional (1-3 sentences max).`;
}

function buildCallPrompt({ contactName, contactCompany, callHistory, repName }) {
  return `You are a sales coach at Arriv, a real estate media company offering photography, videography, MLS walkthroughs, and cinematic video packages.

Generate a concise outbound call script AND 5 key talking points for this call:
- Contact: ${contactName || "a prospect"}${contactCompany ? ` at ${contactCompany}` : ""}
- Sales rep: ${repName || "the rep"}
${callHistory ? `- Previous interactions: ${callHistory}` : "- This is a first-time outreach call"}

Format your response as:
OPENING SCRIPT:
[2-3 sentence opener the rep says when they pick up]

KEY TALKING POINTS:
1. [Point 1]
2. [Point 2]
3. [Point 3]
4. [Point 4]
5. [Point 5]

OBJECTION HANDLING:
[1-2 common objections and brief responses]

Keep it natural, confident, and focused on the value Arriv provides to real estate agents.`;
}