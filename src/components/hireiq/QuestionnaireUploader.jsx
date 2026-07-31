import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Sparkles, Trash2, CheckCircle2, Download, ClipboardList } from "lucide-react";
import { parseQuestionnaireText, parseQuestionnaireFile } from "@/lib/hireiq";
import Round1ScorecardForm from "@/components/hireiq/Round1ScorecardForm";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const ROUND1_PDF_URL = "https://media.base44.com/files/public/698b3b9e4b7d348873dbf213/b8f35ac95_HireHQ_Round1_Scorecard_and_Competency_Guide_v31.pdf";

// The fixed Round 1 sections for generating Round 2 questions
const ROUND1_SECTIONS = [
  { name: "Communication", weight: 20 },
  { name: "Confidence", weight: 15 },
  { name: "Coachability", weight: 20 },
  { name: "Work Ethic", weight: 15 },
  { name: "Professionalism", weight: 10 },
  { name: "Culture Fit", weight: 10 },
];

async function generateRound2Questions(job) {
  const jobContext = [
    job.title && `Job Title: ${job.title}`,
    job.department && `Department: ${job.department}`,
    job.description && `Description: ${job.description}`,
    job.responsibilities?.length && `Responsibilities: ${job.responsibilities.join(", ")}`,
    job.required_qualifications?.length && `Required Qualifications: ${job.required_qualifications.join(", ")}`,
    job.skills?.length && `Skills: ${job.skills.join(", ")}`,
    job.experience_requirements && `Experience: ${job.experience_requirements}`,
  ].filter(Boolean).join("\n");

  const sections = ROUND1_SECTIONS.map(s => `${s.name} (${s.weight}%)`).join(", ");

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert interviewer creating a Round 2 deep-dive interview scorecard for a specific job role.

Round 1 covered these competency sections: ${sections}.

Round 2 should go deeper and be tailored to the specific job. Generate 2-3 role-specific questions for each of the same competency sections, but now make them more technical and job-relevant. Also include any job-specific competency questions based on the role.

Job Context:
${jobContext}

Return a structured scorecard with questions per section. For each question include:
- question (string)
- competency (string - the main competency being assessed)
- explanation (string - what a strong answer looks like, 1-2 sentences)
- section (string - which section it belongs to)`,
    response_json_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              competency: { type: "string" },
              explanation: { type: "string" },
              section: { type: "string" },
            },
          },
        },
      },
    },
  });

  return result?.questions || [];
}

export default function QuestionnaireUploader({ job, onUpdate }) {
  const [mode, setMode] = useState(null); // null | "round1_fill" | "round1_view" | "upload_text" | "upload_file" | "round2_gen"
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [round2Questions, setRound2Questions] = useState(null);
  const [savedRound1, setSavedRound1] = useState(job.round1_scorecard || null);

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
      if (mode === "upload_file") {
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

  const handleRound1Submit = async (scorecardResult) => {
    await onUpdate({ round1_scorecard: scorecardResult });
    setSavedRound1(scorecardResult);
    setMode(null);
  };

  const handleGenerateRound2 = async () => {
    setLoading(true);
    setError(null);
    setRound2Questions(null);
    try {
      const questions = await generateRound2Questions(job);
      setRound2Questions(questions);
    } catch (_) {
      setError("Failed to generate Round 2 questions");
    }
    setLoading(false);
  };

  const handleSaveRound2 = async () => {
    if (!round2Questions || round2Questions.length === 0) return;
    setLoading(true);
    try {
      await onUpdate({ scorecard_template: round2Questions });
      setRound2Questions(null);
      setMode(null);
    } catch (_) {
      setError("Failed to save Round 2 scorecard");
    }
    setLoading(false);
  };

  const innerBg = "#2A2A2A";
  const cardStyle = { backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "12px" };

  if (mode === "round1_fill") {
    return (
      <Round1ScorecardForm
        candidateName=""
        onSubmit={handleRound1Submit}
        onCancel={() => setMode(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Round 1 Scorecard Section */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Round 1 — General Competency Scorecard</h4>
            <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>
              Communication, Confidence, Coachability, Work Ethic, Professionalism, Culture Fit
            </p>
          </div>
          {savedRound1 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
              <CheckCircle2 className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>

        {savedRound1 && mode !== "round1_view" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm rounded-lg p-3" style={{ backgroundColor: innerBg }}>
              <span style={{ color: MUTED_LIGHT }}>Total Score:</span>
              <span className="font-bold text-lg" style={{ color: GOLD }}>{savedRound1.total_score}/100</span>
              <span className="mx-2" style={{ color: MUTED_LIGHT }}>·</span>
              <span style={{ color: MUTED_LIGHT }}>Recommendation:</span>
              <span className="font-medium" style={{ color: CREAM }}>{savedRound1.recommendation || "—"}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setMode("round1_view")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                View Scorecard
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode("round1_fill")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                Re-submit
              </Button>
              <a href={ROUND1_PDF_URL} target="_blank" rel="noopener noreferrer" download>
                <Button size="sm" variant="outline" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                  <Download className="w-3 h-3 mr-1" /> PDF
                </Button>
              </a>
            </div>
          </div>
        ) : mode === "round1_view" && savedRound1 ? (
          <div className="space-y-3">
            {savedRound1.sections?.map((s, i) => (
              <div key={i} className="rounded-lg p-3" style={{ backgroundColor: innerBg }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-sm" style={{ color: CREAM }}>{s.name}</span>
                  <span className="text-sm font-bold" style={{ color: GOLD }}>{s.score}/{s.weight}</span>
                </div>
                {s.questions?.map((q, qi) => (
                  <div key={qi} className="text-xs flex justify-between py-1" style={{ borderTop: qi > 0 ? "1px solid rgba(184,149,106,0.08)" : "none", color: MUTED_LIGHT }}>
                    <span className="flex-1 pr-4">{q.question}</span>
                    <span className="font-bold" style={{ color: q.score >= 4 ? GOLD : q.score >= 3 ? "rgba(255,251,245,0.7)" : "#FCA5A5" }}>{q.score}/5</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex items-center gap-4 text-sm rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
              <span style={{ color: MUTED_LIGHT }}>Total:</span>
              <span className="font-bold text-xl" style={{ color: GOLD }}>{savedRound1.total_score}/100</span>
              <span style={{ color: MUTED_LIGHT }}>Recommendation:</span>
              <span className="font-semibold" style={{ color: CREAM }}>{savedRound1.recommendation || "—"}</span>
              <span style={{ color: MUTED_LIGHT }}>Confidence:</span>
              <span style={{ color: CREAM }}>{savedRound1.interviewer_confidence || "—"}</span>
            </div>
            {savedRound1.overall_notes && (
              <div className="rounded-lg p-3" style={{ backgroundColor: innerBg }}>
                <p className="text-xs font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Overall Notes</p>
                <p className="text-sm" style={{ color: CREAM }}>{savedRound1.overall_notes}</p>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => setMode(null)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              ← Back
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => setMode("round1_fill")} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              <ClipboardList className="w-4 h-4 mr-2" /> Fill Out In System
            </Button>
            <a href={ROUND1_PDF_URL} target="_blank" rel="noopener noreferrer" download>
              <Button variant="outline" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Download className="w-4 h-4 mr-2" /> Download PDF
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* Round 2 AI-Generated Scorecard */}
      <div style={cardStyle}>
        <div className="mb-3">
          <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Round 2 — Role-Specific Scorecard</h4>
          <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>
            AI generates deep-dive, job-specific questions based on the Round 1 sections and your job description.
          </p>
        </div>

        {template.length > 0 && !mode?.startsWith("upload") && !round2Questions ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: GOLD }}>
                <CheckCircle2 className="w-4 h-4" /> {template.length} questions saved
              </p>
              <Button size="sm" variant="outline" onClick={handleClear} disabled={loading} style={{ backgroundColor: "transparent", color: "#FCA5A5", border: "1px solid rgba(220,38,38,0.3)" }}>
                <Trash2 className="w-4 h-4 mr-1" /> Clear
              </Button>
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {template.map((q, i) => (
                <div key={i} className="text-sm rounded p-2" style={{ backgroundColor: innerBg }}>
                  <p className="font-medium" style={{ color: CREAM }}>{i + 1}. {q.question}</p>
                  {q.competency && <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Competency: {q.competency}</p>}
                  {q.section && <p className="text-xs mt-0.5" style={{ color: "rgba(184,149,106,0.7)" }}>Section: {q.section}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setMode("round2_gen"); handleGenerateRound2(); }} disabled={loading} variant="outline" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Sparkles className="w-4 h-4 mr-2" /> Regenerate with AI
              </Button>
              <Button variant="outline" onClick={() => setMode("upload_text")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <FileText className="w-4 h-4 mr-2" /> Replace via Text
              </Button>
              <Button variant="outline" onClick={() => setMode("upload_file")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Upload className="w-4 h-4 mr-2" /> Replace via File
              </Button>
            </div>
            <p className="text-xs" style={{ color: MUTED_LIGHT }}>These questions pre-populate when creating new interview scorecards for candidates.</p>
          </div>
        ) : round2Questions ? (
          <div className="space-y-3">
            <p className="font-semibold text-sm" style={{ color: CREAM }}>AI generated {round2Questions.length} Round 2 questions. Review and save:</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {round2Questions.map((q, i) => (
                <div key={i} className="text-sm rounded p-2" style={{ backgroundColor: innerBg }}>
                  <p className="font-medium" style={{ color: CREAM }}>{i + 1}. {q.question}</p>
                  {q.competency && <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Competency: {q.competency}</p>}
                  {q.section && <p className="text-xs mt-0.5" style={{ color: "rgba(184,149,106,0.7)" }}>Section: {q.section}</p>}
                  {q.explanation && <p className="text-xs mt-0.5 italic" style={{ color: MUTED_LIGHT }}>{q.explanation}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRound2Questions(null)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
              <Button onClick={handleSaveRound2} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Save as Round 2 Template
              </Button>
            </div>
          </div>
        ) : mode === "upload_text" ? (
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              placeholder="Paste your Round 2 questionnaire text here..."
              className="w-full text-sm px-3 py-2 rounded"
              style={{ backgroundColor: innerBg, color: CREAM, border: "1px solid rgba(184,149,106,0.15)" }}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMode(null); setText(""); }} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
              <Button onClick={handleParse} disabled={loading || !text.trim()} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Parse Questions
              </Button>
            </div>
          </div>
        ) : mode === "upload_file" ? (
          <div className="space-y-3">
            <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFile} className="text-sm" style={{ color: CREAM }} />
            {fileUrl && <p className="text-xs" style={{ color: GOLD }}>File uploaded. Click parse to extract questions.</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMode(null); setFileUrl(""); }} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
              <Button onClick={handleParse} disabled={loading || !fileUrl} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Parse Questions
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setMode("round2_gen"); handleGenerateRound2(); }} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate with AI
            </Button>
            <Button variant="outline" onClick={() => setMode("upload_text")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <FileText className="w-4 h-4 mr-2" /> Paste Text
            </Button>
            <Button variant="outline" onClick={() => setMode("upload_file")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <Upload className="w-4 h-4 mr-2" /> Upload File
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: "#FCA5A5" }}>{error}</p>}

      {parsed && parsed.length > 0 && (
        <div className="rounded-lg p-4 space-y-2" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <p className="font-semibold mb-2" style={{ color: CREAM }}>Parsed {parsed.length} questions. Review and save:</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {parsed.map((q, i) => (
              <div key={i} className="text-sm rounded p-2" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-medium" style={{ color: CREAM }}>{i + 1}. {q.question}</p>
                {q.competency && <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Competency: {q.competency}</p>}
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Save as Round 2 Template
          </Button>
        </div>
      )}
    </div>
  );
}