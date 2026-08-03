import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Download, Loader2, Calendar } from "lucide-react";

export default function MonthlyStatementsTab() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await base44.functions.invoke("getPayoutRecords", { action: "get_monthly_statements" });
        if (cancelled) return;
        if (res.data?.documents) setDocs(res.data.documents);
        else setError(res.data?.error || "Could not load monthly statements.");
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load monthly statements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      const res = await base44.functions.invoke("getPayoutRecords", { action: "download_document", document_id: doc.id });
      if (res.data?.download_url) {
        window.open(res.data.download_url, "_blank");
      } else {
        alert(res.data?.error || "Could not download document.");
      }
    } catch (e) {
      alert(e.message || "Could not download document.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card className="border-[#B8956A]/20 bg-white">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-[#B8956A]" />
          </div>
          <div>
            <CardTitle className="text-[#1A1A1A]">Monthly Statements</CardTitle>
            <p className="text-xs text-[#1A1A1A]/60 mt-0.5">Arriv Payroll-generated monthly statements</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-8">{error}</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-[#1A1A1A]/60 text-center py-8">No monthly statements available yet.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-[#FFFBF5] rounded-lg border border-[#B8956A]/10 hover:border-[#B8956A]/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
                    <CalendarDays className="w-5 h-5 text-[#B8956A]" />
                  </div>
                  <div>
                    <div className="font-semibold text-[#1A1A1A]">{doc.title || "Monthly Statement"}</div>
                    <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
                      <Calendar className="w-3 h-3" />
                      {doc.period_start && doc.period_end
                        ? `${new Date(doc.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(doc.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : doc.tax_year || "Statement period"}
                    </div>
                    {doc.is_amended && (
                      <span className="inline-block mt-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Amended</span>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id} className="border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/10">
                  {downloadingId === doc.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}