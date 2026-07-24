import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import { createPageUrl } from "../utils";

export default function BackgroundCheck() {
  const location = useLocation();
  const navigate = useNavigate();
  const [invitationUrl, setInvitationUrl] = useState(location.state?.invitationUrl || null);
  const [loading, setLoading] = useState(!invitationUrl);

  useEffect(() => {
    if (invitationUrl) return;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.checkr_invitation_url) {
          setInvitationUrl(me.checkr_invitation_url);
        }
      } catch (e) {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [invitationUrl]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-4 py-6 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#B8956A]" />
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Background Check</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl("JobBoard"))}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Jobs
          </Button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#B8956A] animate-spin" />
          </div>
        ) : !invitationUrl ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-[var(--text-secondary)]">
              We couldn't find an active background check for your account.
            </p>
            <Button onClick={() => navigate(createPageUrl("JobBoard"))} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
              Back to Jobs
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20 px-4 py-3">
              <p className="text-sm text-[#1A1A1A]/80">
                Complete the secure background check form below. Once submitted, you'll be confirmed
                for your gig — we'll notify you when the screening is complete.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10 shrink-0"
                onClick={() => window.open(invitationUrl, "_blank", "noopener")}
              >
                <ExternalLink className="w-4 h-4 mr-1" /> Open in new tab
              </Button>
            </div>
            <div className="flex-1 rounded-lg overflow-hidden border border-[#B8956A]/20 bg-white">
              <iframe
                src={invitationUrl}
                title="Background Check"
                className="w-full h-[70vh]"
                style={{ minHeight: "600px" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}