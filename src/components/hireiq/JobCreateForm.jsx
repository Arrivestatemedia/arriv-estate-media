import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Link, FileText, Upload } from "lucide-react";
import { analyzeJobFromUrl, analyzeJobFromText, analyzeJobFromFile } from "@/lib/hireiq";
import { base44 } from "@/api/base44Client";

export default function JobCreateForm({ onCreate, onCancel }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (mode === "url") {
        if (!url.trim()) throw new Error("Please enter a job posting URL");
        result = await analyzeJobFromUrl(url.trim());
      } else if (mode === "text") {
        if (!text.trim()) throw new Error("Please paste a job description");
        result = await analyzeJobFromText(text.trim());
      } else {
        if (!file) throw new Error("Please upload a job description file");
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        result = await analyzeJobFromFile(file_url);
        result.source_url = file_url;
      }
      result.source_type = mode;
      if (mode === "url") result.source_url = url.trim();
      onCreate(result);
    } catch (err) {
      setError(err.message || "Failed to analyze job description");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "url", label: "Job URL", icon: Link },
    { id: "text", label: "Paste Text", icon: FileText },
    { id: "file", label: "Upload File", icon: Upload },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-2">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setMode(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                mode === t.id ? "bg-[#B8956A] text-white" : "text-gray-500 hover:bg-gray-100"
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {mode === "url" && (
        <Input placeholder="https://example.com/jobs/sales-manager" value={url} onChange={e => setUrl(e.target.value)} />
      )}
      {mode === "text" && (
        <Textarea placeholder="Paste the full job description here..." value={text} onChange={e => setText(e.target.value)} rows={10} />
      )}
      {mode === "file" && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input type="file" accept=".pdf,.doc,.docx,.txt,.html" onChange={e => setFile(e.target.files[0])} className="hidden" id="job-file-upload" />
          <label htmlFor="job-file-upload" className="cursor-pointer">
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">{file ? file.name : "Click to upload PDF, Word, or text file"}</p>
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleAnalyze} disabled={loading} style={{ backgroundColor: "#B8956A" }}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : "Analyze & Create Job"}
        </Button>
      </div>
    </div>
  );
}