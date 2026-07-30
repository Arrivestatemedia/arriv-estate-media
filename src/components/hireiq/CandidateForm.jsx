import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { analyzeResumeText, analyzeResumeFile } from "@/lib/hireiq";

export default function CandidateForm({ jobId, jobData, roleProfile, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeMode, setResumeMode] = useState("upload");
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Candidate name is required"); return; }
    setLoading(true);
    setError(null);
    try {
      let resumeUrl = null;
      let analysis = null;

      if (resumeMode === "upload" && resumeFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: resumeFile });
        resumeUrl = file_url;
        analysis = await analyzeResumeFile(file_url, jobData, roleProfile);
      } else if (resumeMode === "text" && resumeText.trim()) {
        analysis = await analyzeResumeText(resumeText.trim(), jobData, roleProfile);
      }

      const candidate = await base44.entities.HireCandidate.create({
        job_id: jobId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        resume_url: resumeUrl,
        resume_text: resumeMode === "text" ? resumeText.trim() : "",
        cover_letter: coverLetter.trim(),
        resume_analysis: analysis,
        status: "applied",
        decision: "pending",
      });

      onCreated(candidate);
    } catch (err) {
      setError(err.message || "Failed to add candidate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Name *</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Email</label>
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@email.com" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Phone</label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
      </div>

      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setResumeMode("upload")} className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-sm font-medium ${resumeMode === "upload" ? "bg-[#B8956A] text-white" : "text-gray-500"}`}>
          <Upload className="w-4 h-4" /> Upload Resume
        </button>
        <button onClick={() => setResumeMode("text")} className={`flex items-center gap-2 px-3 py-1.5 rounded-t text-sm font-medium ${resumeMode === "text" ? "bg-[#B8956A] text-white" : "text-gray-500"}`}>
          <FileText className="w-4 h-4" /> Paste Resume
        </button>
      </div>

      {resumeMode === "upload" ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => setResumeFile(e.target.files[0])} className="hidden" id="resume-upload" />
          <label htmlFor="resume-upload" className="cursor-pointer">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-1" />
            <p className="text-sm text-gray-600">{resumeFile ? resumeFile.name : "Click to upload resume (PDF, Word, or text)"}</p>
          </label>
        </div>
      ) : (
        <Textarea placeholder="Paste resume text here..." value={resumeText} onChange={e => setResumeText(e.target.value)} rows={8} />
      )}

      <div>
        <label className="text-sm font-medium mb-1 block">Cover Letter (optional)</label>
        <Textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={3} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading} style={{ backgroundColor: "#B8956A" }}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding & analyzing resume...</> : "Add Candidate"}
        </Button>
      </div>
    </div>
  );
}