import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Brain, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#B8956A";
const DARK = "#1A1A1A";

/**
 * Admin action to convert an existing scheduled Conference to AI interview mode.
 * Does NOT change the meeting link or room name — the same /Conference?room=... URL
 * will automatically open the Tavus AI interview the next time it is opened.
 */
export default function ConvertToAiButton({ conference, onConverted }) {
  const [converting, setConverting] = useState(false);

  if (!conference) return null;
  // Only show for scheduled interviews that are still in human mode
  if (conference.interview_mode === "ai") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
        <Brain className="w-3 h-3" /> AI Interviewer
      </span>
    );
  }
  if (conference.status === "completed" || conference.status === "cancelled") return null;

  const handleConvert = async () => {
    if (!confirm("Convert this interview to use the AI interviewer? The existing meeting link will NOT change — the applicant will join the same URL and be interviewed by AI instead of a human.")) {
      return;
    }
    setConverting(true);
    try {
      const res = await base44.functions.invoke("convertConferenceToAi", {
        roomName: conference.room_name,
      });
      const data = res?.data || res;
      if (data?.status === "success") {
        toast.success("Interview converted to AI interviewer. The existing link will now open the AI interview.");
        if (onConverted) onConverted(conference.id);
      } else {
        throw new Error(data?.error || "Failed to convert");
      }
    } catch (e) {
      toast.error(e.message || "Failed to convert to AI interview");
    } finally {
      setConverting(false);
    }
  };

  return (
    <Button
      onClick={handleConvert}
      disabled={converting}
      variant="outline"
      size="sm"
      style={{ borderColor: GOLD, color: GOLD, backgroundColor: "transparent" }}
    >
      {converting ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <Brain className="w-3 h-3 mr-1" />
      )}
      Use AI Interviewer
    </Button>
  );
}