import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck, Download, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

export default function TaxDocumentsTab() {
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
        const res = await base44.functions.invoke("getPayoutRecords", { action: "get_tax_documents" });
        if (cancelled) return;
        if (res.data?.documents) setDocs(res.data.documents);
        else setError(res.data?.error || "Could not load tax documents.");
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load tax documents.");
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

  const docTypeLabel = (t) => {
    const map = { w9: "W-9", tax_document: "Tax Document", corrected_tax_document: "Corrected Tax Document" };
    return map[t] || t;
  };

  const w9Docs = docs.filter((d) => d.document_type === "w9");
  const taxDocs = docs.filter((d) => d.document_type === "tax_document" || d.document_type === "corrected_tax_document");

  return (
    <div className="space-y-4">
      {/* Security notice */}
      <div className="flex items-start gap-2 p-3 bg-[#1A1A1A]/5 rounded-lg border border-[#B8956A]/20">
        <ShieldCheck className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
        <p className="text-xs text-[#1A1A1A]/70 leading-relaxed">
          For your security, full taxpayer identification numbers are never displayed. Documents are accessed via secure, time-limited links.
        </p>
      </div>

      {/* W-9 */}
      <Card className="border-[#B8956A]/20 bg-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-[#B8956A]" />
            </div>
            <CardTitle className="text-[#1A1A1A]">W-9 Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {w9Docs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-orange-700">
              <AlertCircle className="w-4 h-4" />
              No W-9 on file. Please submit your W-9 to complete your tax profile.
            </div>
          ) : (
            <div className="space-y-3">
              {w9Docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-[#FFFBF5] rounded-lg border border-[#B8956A]/10">
                  <div className="flex items-center gap-4">
                    <FileCheck className="w-5 h-5 text-[#B8956A]" />
                    <div>
                      <div className="font-semibold text-[#1A1A1A]">W-9 Tax Form</div>
                      <Badge variant="outline" className={`mt-1 ${doc.status === "available" ? "border-amber-300 text-amber-800" : "border-orange-300 text-orange-800"}`}>
                        {doc.status === "available" ? "On File" : doc.status}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id} className="border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/10">
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                    View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tax Documents */}
      <Card className="border-[#B8956A]/20 bg-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-[#B8956A]" />
            </div>
            <CardTitle className="text-[#1A1A1A]">Annual Tax Documents</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
            </div>
          ) : taxDocs.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/60 text-center py-8">No annual tax documents available yet. They will appear here when generated.</p>
          ) : (
            <div className="space-y-3">
              {taxDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-[#FFFBF5] rounded-lg border border-[#B8956A]/10 hover:border-[#B8956A]/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
                      <FileCheck className="w-5 h-5 text-[#B8956A]" />
                    </div>
                    <div>
                      <div className="font-semibold text-[#1A1A1A]">
                        {doc.title || docTypeLabel(doc.document_type)} {doc.tax_year ? `— ${doc.tax_year}` : ""}
                      </div>
                      {doc.is_amended && (
                        <span className="inline-block mt-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Corrected</span>
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
    </div>
  );
}