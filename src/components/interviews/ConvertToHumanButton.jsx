import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { User, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOLD = "#B8956A";

/**
 * Admin action to convert an AI interview back to a human interview.
 * Ends any active Tavus conversation and flips the mode so the existing
 * /Conference?room=... URL opens the Twilio video room instead.
 */
export default function ConvertToHumanButton({ conference, onConverted }) {
  const [converting, setConverting] = useState(false);

  if (!conference) return null;

  if (conference.interview_mode !== "ai") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
        style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}
      >
        <User className="w-3 h-3" /> Human Interviewer
      </span>
    );
  }

  if (conference.status === "completed" || conference.status === "cancelled") return null;

  const handleConvert = async () => {
    if (
      !confirm(
        "Convert this interview back to a human interviewer? The existing meeting link will NOT change — the applicant will join the same URL and be interviewed by a person instead of AI. Any active AI session will be ended."
      )
    ) {
      return;
    }
    setConverting(true);
    try {
      const res = await base44.functions.invoke("convertConferenceToHuman", {
        roomName: conference.room_name,
      });
      const data = res?.data || res;
      if (data?.status === "success") {
        toast.success("Interview converted to human interviewer. The existing link will now open the human interview.");
        if (onConverted) onConverted(conference.id);
      } else {
        throw new Error(data?.error || "Failed to convert");
      }
    } catch (e) {
      toast.error(e.message || "Failed to convert to human interview");
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
        <User className="w-3 h-3 mr-1" />
      )}
      Use Human Interviewer
    </Button>
  );
}