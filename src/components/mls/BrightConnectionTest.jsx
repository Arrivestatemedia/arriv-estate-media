import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, PlugZap, CheckCircle2, AlertCircle, Info } from "lucide-react";

/**
 * BrightConnectionTest
 * The admin-only "Test Bright Connection" action. It reports what can be checked without contact
 * with Bright — secret presence, endpoint and link base, and a signing round-trip — and states
 * plainly that authentication itself cannot be proven without a real submission.
 */
export default function BrightConnectionTest() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("testBrightConnection", {
        email: localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email") || undefined,
        sales_member_id: localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id") || undefined,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || "The connection check could not run");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (next) => {
    setOpen(next);
    if (next && !result && !busy) run();
  };

  return (
    <>
      <Button variant="outline" onClick={() => handleOpenChange(true)} className="border-[#B8956A]/40 text-[#8a6d4a]">
        <PlugZap className="w-4 h-4 mr-1.5" /> Test Bright Connection
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlugZap className="w-5 h-5 text-[#B8956A]" /> Bright connection check
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-[#1A1A1A]/55">
              Verifies the configuration Bright needs. It does not contact Bright and never submits a manifest.
            </p>

            {busy && (
              <p className="text-sm text-[#1A1A1A]/60 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" /> Checking configuration…
              </p>
            )}

            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-2">{error}</p>
            )}

            {result && (
              <>
                <div className="rounded-lg border border-[#B8956A]/25 bg-[#FFFBF5] p-3">
                  <p className={`text-sm font-medium mb-2 ${result.ready_to_submit ? "text-[#8a6d4a]" : "text-amber-800"}`}>
                    {result.ready_to_submit
                      ? "Configuration is complete — ready for an authorized submission"
                      : `${result.failing_count} check(s) need attention before a submission`}
                  </p>
                  <ul className="space-y-1.5">
                    {(result.checks || []).map((check) => (
                      <li key={check.id} className="flex items-start gap-1.5 text-xs">
                        {check.status === "pass" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#8a6d4a] mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        )}
                        <span className="text-[#1A1A1A]/75">
                          <span className="font-medium">{check.label}</span> — {check.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Authentication cannot be verified here
                  </p>
                  <p className="text-xs text-amber-900/85">{result.authentication?.reason}</p>
                  <p className="text-xs text-amber-900/85 mt-1">{result.authentication?.how_it_is_proven}</p>
                </div>

                <p className="text-[11px] text-[#1A1A1A]/45">
                  Media links stay valid {result.link_lifetime_days} days from the moment a manifest is built.
                  Nothing was sent to Bright.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}