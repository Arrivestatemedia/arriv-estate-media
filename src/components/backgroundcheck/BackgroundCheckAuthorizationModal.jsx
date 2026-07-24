import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function BackgroundCheckAuthorizationModal({ open, onOpenChange, context, onAuthorized }) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!agreed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("initiateBackgroundCheck", context || {});
      const data = res.data || {};
      if (data.invitation_url || data.manual || data.alreadyCleared) {
        onAuthorized(data);
      } else {
        throw new Error(data.error || "Failed to start background check");
      }
    } catch (e) {
      setError(e?.data?.error || e?.message || "Failed to start background check");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) { onOpenChange(o); if (!o) { setAgreed(false); setError(null); } } }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto border-2 border-[#B8956A]/30 bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1A1A1A]">
            <ShieldCheck className="w-5 h-5 text-[#B8956A]" />
            Background Check Authorization
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-[#1A1A1A]/80 py-2">
          <p>At Arriv Estate Media, trust and professionalism are at the core of everything we do.</p>
          <p>
            Because our Media Partners frequently visit clients' homes, businesses, and private
            properties, we require a background check as part of our onboarding process. This helps
            us maintain a safe, reliable marketplace while protecting our clients, our Media
            Partners, and the Arriv brand.
          </p>
          <p>
            The background check is conducted securely through our trusted screening partner and is
            used solely to evaluate eligibility to participate on the Arriv platform. Your
            information will be handled confidentially and in accordance with all applicable laws.
          </p>
          <p>
            By continuing, you authorize Arriv Estate Media and its authorized screening provider to
            conduct a background check as permitted by law. Additional disclosures and authorization
            forms may be presented before the screening is completed.
          </p>
          <p>
            This screening is required before your account can be activated and you can begin
            accepting assignments.
          </p>
        </div>

        <label className="flex items-start gap-3 py-2 cursor-pointer select-none">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
          <span className="text-sm text-[#1A1A1A]">
            I understand and authorize Arriv Estate Media to conduct a background check as part of my
            onboarding process.
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="border-[#1A1A1A]/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!agreed || loading}
            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…
              </>
            ) : (
              "Continue to Background Check"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}