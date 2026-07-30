import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { analyzeResumeText } from "@/lib/hireiq";

export default function ImportApplicationsModal({ jobId, jobData, roleProfile, onImported, onCancel }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    base44.entities.JobApplication.list("-created_date", 100)
      .then(res => {
        const list = res?.data ?? res;
        setApplications((Array.isArray(list) ? list : []).filter(a => !a.archived));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleImport = async (app) => {
    setImporting(app.id);
    try {
      const resumeText = [
        `Name: ${app.full_name}`,
        `Email: ${app.email}`,
        `Phone: ${app.phone}`,
        `LinkedIn: ${app.linkedin || "N/A"}`,
        `Portfolio: ${app.portfolio_link || "N/A"}`,
        `Last Related Job: ${app.last_related_job || "N/A"}`,
        `Why Good Fit: ${app.why_good_fit || "N/A"}`,
        app.documents?.length ? `Documents: ${app.documents.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const analysis = await analyzeResumeText(resumeText, jobData, roleProfile);

      const res = await base44.entities.HireCandidate.create({
        job_id: jobId,
        name: app.full_name,
        email: app.email,
        phone: app.phone,
        resume_text: resumeText,
        resume_analysis: analysis,
        cover_letter: app.why_good_fit || "",
        status: "applied",
        decision: "pending",
        documents: (app.documents || []).map(url => ({ url, type: "application_document" })),
      });
      const candidate = res?.data ?? res;

      onImported(candidate);
    } catch (err) {
      alert("Failed to import: " + (err.message || "unknown error"));
    } finally {
      setImporting(null);
    }
  };

  const filtered = applications.filter(a =>
    !search || a.full_name?.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Import existing Arriv One job applications as HireIQ candidates. Resume data is automatically parsed from the application.</p>
      <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm" />
      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No applications found</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2">
          {filtered.map(app => (
            <div key={app.id} className="border rounded-lg p-3 flex justify-between items-center hover:bg-gray-50">
              <div>
                <p className="font-medium text-sm">{app.full_name}</p>
                <p className="text-xs text-gray-500">{app.email} · {app.position?.replace(/_/g, " ") || "N/A"}</p>
                <span className="text-xs text-gray-400">{app.status}</span>
              </div>
              <Button size="sm" onClick={() => handleImport(app)} disabled={importing === app.id} style={{ backgroundColor: "#B8956A" }}>
                {importing === app.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Import</>}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>Close</Button>
      </div>
    </div>
  );
}