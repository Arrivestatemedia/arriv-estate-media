import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Download, ShieldCheck } from "lucide-react";

// Modal viewer for signed documents. Calls getSignedDocument to get a
// time-limited signed URL for the PDF, then displays it in an iframe.
export default function SignedDocumentViewer({ open, onOpenChange, signRequest }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const salesMemberId = typeof window !== "undefined"
    ? (localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id") || "")
    : "";

  useEffect(() => {
    if (!open || !signRequest) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await base44.functions.invoke("getSignedDocument", {
          id: signRequest.id,
          sales_member_id: salesMemberId,
        });
        const d = res?.data ?? res;
        if (cancelled) return;
        if (d?.error) throw new Error(d.error);
        setData(d);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load signed document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, signRequest, salesMemberId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{signRequest?.document_title || "Signed Document"}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Loading signed document…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 max-w-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#1A1A1A] hover:bg-[#2a3536]"
            >
              Close
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="flex flex-col" style={{ height: "75vh" }}>
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3 bg-[#FFFBF5] border-b border-[#B8956A]/20">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[#1A1A1A] truncate">
                  {data.document_title || signRequest?.document_title}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#B8956A] shrink-0" />
                  <p className="text-xs text-slate-500 truncate">
                    Signed by <strong className="text-[#1A1A1A]">{data.candidate_name}</strong>
                    {data.signed_at && ` on ${new Date(data.signed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
                    {data.signature_method && ` · ${data.signature_method}`}
                  </p>
                </div>
              </div>
              {data.signed_url && (
                <a
                  href={data.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[#B8956A]/10 text-[#B8956A] hover:bg-[#B8956A]/20 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              )}
            </div>

            {/* PDF iframe */}
            {data.signed_url ? (
              <iframe
                src={data.signed_url}
                className="flex-1 w-full border-0"
                title="Signed Document"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Signed PDF not available
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}