import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Film, Loader2, ExternalLink } from "lucide-react";

// Client Portal entry tile for Arriv Studio.
// Launches canonical Arriv Studio with real-estate context.
export default function ArrivStudioTile({ subscription, onManage }) {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState(null);

  const handleLaunch = async (context = {}) => {
    setLaunching(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('launchArrivStudio', context);
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
    <div className="bg-gradient-to-br from-[#1A1A1A] to-[#2a3536] rounded-2xl border-2 border-[#B8956A]/40 overflow-hidden mb-8">
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#B8956A]/20 flex items-center justify-center shrink-0">
            <Film className="w-6 h-6 text-[#B8956A]" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[#FFFBF5] tracking-wide">ARRIV STUDIO</h2>
            <p className="text-sm text-[#FFFBF5]/70 mt-1">
              Create professional real-estate videos, social content, promotions, and training.
            </p>
          </div>
        </div>

        {subscription && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#B8956A]/15 border border-[#B8956A]/30">
            <p className="text-xs text-[#FFFBF5]/80">
              <span className="font-semibold text-[#B8956A]">{subscription.plan_name}</span>
              {subscription.minutes_remaining != null && (
                <span className="ml-2">· {subscription.minutes_remaining} min remaining</span>
              )}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 mb-3">{error}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => handleLaunch()}
            disabled={launching}
            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {launching ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Launching...</>
            ) : (
              <><ExternalLink className="w-4 h-4 mr-2" /> Launch Arriv Studio</>
            )}
          </Button>
          {onManage && (
            <Button
              onClick={onManage}
              variant="outline"
              className="border-[#B8956A]/40 text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
            >
              {subscription ? 'Manage Subscription' : 'See Studio Plans'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}