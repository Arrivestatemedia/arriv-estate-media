import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Sparkles, Trash2, CheckCircle2 } from "lucide-react";
import { parseQuestionnaireText, parseQuestionnaireFile } from "@/lib/hireiq";

export default function QuestionnaireUploader({ job, onUpdate }) {
  const [mode, setMode] = useState(null);
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const template = job.scorecard_template || [];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
    } catch (_) {
      setError("Failed to upload file");
    }
    setLoading(false);
  };

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    setParsed(null);
    try {
      let result;
      if (mode === "file") {
        if (!fileUrl) throw new Error("Upload a file first");
        result = await parseQuestionnaireFile(fileUrl, job, job.role_success_profile);
      } else {
        if (!text.trim()) throw new Error("Paste questionnaire text first");
        result = await parseQuestionnaireText(text, job, job.role_success_profile);
      }
      setParsed(result?.questions || []);
    } catch (_) {
      setError("Failed to parse questionnaire");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed || parsed.length === 0) return;
    setLoading(true);
    try {
      await onUpdate({ scorecard_template: parsed });
      setParsed(null);
      setMode(null);
      setText("");
      setFileUrl("");
    } catch (_) {
      setError("Failed to save questionnaire");
    }
    setLoading(false);
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onUpdate({ scorecard_template: [] });
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {template.length > 0 && !mode && (
        <div className="border rounded-lg p-4 bg-green-50 border-green-200">
          <div className="flex justify-between items-center mb-2">
            <p className="font-semibold text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Questionnaire Uploaded ({template.length} questions)
            </p>
            <Button size="sm" variant="outline" onClick={handleClear} disabled={loading}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {template.map((q, i) => (
              <div key={i} className="text-sm bg-white rounded p-2 border">
                <p className="font-medium">{i + 1}. {q.question}</p>
                {q.competency && <p className="text-xs text-gray-500 mt-0.5">Competency: {q.competency}</p>}
                {q.explanation && <p className="text-xs text-gray-400 mt-0.5">{q.explanation}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">These questions pre-populate when creating new interview scorecards for candidates.</p>
        </div>
      )}

      {!mode && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("text")}><FileText className="w-4 h-4 mr-2" /> Paste Text</Button>
          <Button variant="outline" onClick={() => setMode("file")}><Upload className="w-4 h-4 mr-2" /> Upload File</Button>
        </div>
      )}

      {mode === "text" && (
        <div className="space-y-3">
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Paste your questionnaire text here..." />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode(null); setText(""); }}>Cancel</Button>
            <Button onClick={handleParse} disabled={loading || !text.trim()} style={{ backgroundColor: "#B8956A" }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Parse Questions
            </Button>
          </div>
        </div>
      )}

      {mode === "file" && (
        <div className="space-y-3">
          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFile} className="text-sm" />
          {fileUrl && <p className="text-xs text-green-600">File uploaded. Click parse to extract questions.</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode(null); setFileUrl(""); }}>Cancel</Button>
            <Button onClick={handleParse} disabled={loading || !fileUrl} style={{ backgroundColor: "#B8956A" }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Parse Questions
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {parsed && parsed.length > 0 && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="font-semibold mb-2">Parsed {parsed.length} questions. Review and save:</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {parsed.map((q, i) => (
              <div key={i} className="text-sm bg-gray-50 rounded p-2 border">
                <p className="font-medium">{i + 1}. {q.question}</p>
                {q.competency && <p className="text-xs text-gray-500 mt-0.5">Competency: {q.competency}</p>}
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={loading} style={{ backgroundColor: "#B8956A" }}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Save as Scorecard Template
          </Button>
        </div>
      )}
    </div>
  );
}