import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Film, Loader2, ArrowRight } from "lucide-react";
import { postDeliveryActions } from "@/lib/arrivStudioConfig";

// Post-delivery "CREATE WITH ARRIV STUDIO" prompt shown on delivered bookings.
// Launches Studio with delivered media context preloaded.
export default function PostDeliveryStudioPrompt({ booking }) {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState(null);

  const handleLaunch = async (templateId) => {
    setLaunching(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('launchArrivStudio', {
        booking_id: booking?.id,
        template_id: templateId,
        asset_source: 'my_estate_media',
      });
      const data = res?.data;
      if (data?.launch_url) {
        window.open(data.launch_url, '_blank', 'noopener,noreferrer');
      } else {
        setError(data?.error || 'Unable to launch Arriv Studio.');
      }
    } catch (e) {
      setError(e?.message || 'Failed to launch Arriv Studio.');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border-2 border-[#B8956A]/30 bg-gradient-to-br from-[#1A1A1A] to-[#2a3536] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Film className="w-5 h-5 text-[#B8956A]" />
        <h4 className="text-sm font-bold text-[#FFFBF5] tracking-wide">
          CREATE WITH ARRIV STUDIO
        </h4>
      </div>
      <p className="text-xs text-[#FFFBF5]/70 mb-3">
        Your media is delivered. Turn it into professional videos, social content, and promotions.
      </p>
      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {postDeliveryActions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            onClick={() => handleLaunch(action.templateId)}
            disabled={launching}
            className="bg-[#B8956A]/20 hover:bg-[#B8956A]/30 text-[#FFFBF5] border border-[#B8956A]/30 text-xs"
          >
            {launching ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <ArrowRight className="w-3 h-3 mr-1" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}