import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Sparkles, Trash2, CheckCircle2, Download, ClipboardList, Users, ChevronDown } from "lucide-react";
import { parseQuestionnaireText, parseQuestionnaireFile, evaluateCandidate } from "@/lib/hireiq";
import Round1ScorecardForm from "@/components/hireiq/Round1ScorecardForm";
import Round2ScorecardForm from "@/components/hireiq/Round2ScorecardForm";
import { downloadRound1BlankPdf, downloadRound1FilledPdf, downloadRound2BlankPdf, downloadRound2FilledPdf } from "@/lib/scorecardPdf";
import { ROUND1_SECTIONS } from "@/lib/round1Questions";
import { normalizeQuestion } from "@/lib/scorecardScoring";
import ScorecardGuide from "@/components/hireiq/ScorecardGuide";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

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

For EVERY question, you must include ALL of the following fields:
- question (string): The interview question text
- section (string): Which competency section it belongs to (Communication, Confidence, Coachability, Work Ethic, Professionalism, Culture Fit, or a job-specific section)
- competencies (array of strings): One or more competencies this question measures
- weight (number): Question weight for scoring (default 1, use higher for critical questions)
- excellent_answer (string): What an excellent answer demonstrates (1-2 sentences)
- poor_answer (string): What a poor answer looks like (1-2 sentences)
- why_this_matters (string): Why this question is important for evaluating this role (1 sentence)

The interviewer should never have to create these fields manually. Generate them all.`,
    response_json_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              section: { type: "string" },
              competencies: { type: "array", items: { type: "string" } },
              weight: { type: "number" },
              excellent_answer: { type: "string" },
              poor_answer: { type: "string" },
              why_this_matters: { type: "string" },
            },
          },
        },
      },
    },
  });
  return result?.questions || [];
}

const cardStyle = { backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "12px" };
const innerBg = "#2A2A2A";

function ScorecardSummary({ scorecard }) {
  return (
    <div className="space-y-2">
      {scorecard.competency_scores && Object.keys(scorecard.competency_scores).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mb-2">
          {Object.entries(scorecard.competency_scores).map(([comp, score]) => (
            <div key={comp} className="flex justify-between text-xs rounded px-2.5 py-1" style={{ backgroundColor: innerBg }}>
              <span style={{ color: MUTED_LIGHT }}>{comp}</span>
              <span className="font-bold" style={{ color: GOLD }}>{score}/100</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-sm rounded-lg p-3" style={{ backgroundColor: innerBg }}>
        <span style={{ color: MUTED_LIGHT }}>Total Score:</span>
        <span className="font-bold text-lg" style={{ color: GOLD }}>{scorecard.total_score}/100</span>
        <span className="mx-2" style={{ color: MUTED_LIGHT }}>·</span>
        <span style={{ color: MUTED_LIGHT }}>Recommendation:</span>
        <span className="font-medium" style={{ color: CREAM }}>{scorecard.recommendation || "—"}</span>
      </div>
      {scorecard.sections && (
        <div className="grid grid-cols-2 gap-1.5">
          {scorecard.sections.map((s, i) => (
            <div key={i} className="flex justify-between text-xs rounded px-2.5 py-1" style={{ backgroundColor: innerBg }}>
              <span style={{ color: MUTED_LIGHT }}>{s.name}</span>
              <span className="font-bold" style={{ color: GOLD }}>{s.score}/{s.weight || s.max_score || 100}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScorecardView({ scorecard }) {
  return (
    <div className="space-y-3">
      {scorecard.competency_scores && Object.keys(scorecard.competency_scores).length > 0 && (
        <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: GOLD }}>Competency Scores (Auto-Calculated)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {Object.entries(scorecard.competency_scores).map(([comp, score]) => (
              <div key={comp} className="flex justify-between text-xs rounded px-2.5 py-1" style={{ backgroundColor: innerBg }}>
                <span style={{ color: MUTED_LIGHT }}>{comp}</span>
                <span className="font-bold" style={{ color: GOLD }}>{score}/100</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {scorecard.sections?.map((s, i) => (
        <div key={i} className="rounded-lg p-3" style={{ backgroundColor: innerBg }}>
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-sm" style={{ color: CREAM }}>{s.name}</span>
            <span className="text-sm font-bold" style={{ color: GOLD }}>{s.score}/{s.weight || s.max_score || 100}</span>
          </div>
          {s.questions?.map((q, qi) => {
            const nq = normalizeQuestion(q);
            const rating = nq.rating || q.score || 0;
            return (
              <div key={qi} className="py-2" style={{ borderTop: qi > 0 ? "1px solid rgba(184,149,106,0.08)" : "none" }}>
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs flex-1 pr-4" style={{ color: CREAM }}>{nq.question || q.question}</span>
                  <span className="font-bold text-xs whitespace-nowrap" style={{ color: rating >= 4 ? GOLD : rating >= 3 ? "rgba(255,251,245,0.7)" : "#FCA5A5" }}>{rating}/5</span>
                </div>
                {nq.competencies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {nq.competencies.map(c => (
                      <span key={c} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD }}>{c}</span>
                    ))}
                  </div>
                )}
                {nq.excellent_answer && <p className="text-xs mb-0.5" style={{ color: "rgba(184,149,106,0.6)" }}><span className="font-semibold">Excellent:</span> {nq.excellent_answer}</p>}
                {nq.poor_answer && <p className="text-xs mb-0.5" style={{ color: "rgba(252,165,165,0.5)" }}><span className="font-semibold">Poor:</span> {nq.poor_answer}</p>}
                {nq.evidence && <p className="text-xs mb-0.5" style={{ color: MUTED_LIGHT }}><span className="font-semibold">Evidence:</span> {nq.evidence}</p>}
                {nq.notes && <p className="text-xs" style={{ color: MUTED_LIGHT }}><span className="font-semibold">Notes:</span> {nq.notes}</p>}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-4 text-sm rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
        <span style={{ color: MUTED_LIGHT }}>Total:</span>
        <span className="font-bold text-xl" style={{ color: GOLD }}>{scorecard.total_score}/100</span>
        <span style={{ color: MUTED_LIGHT }}>Recommendation:</span>
        <span className="font-semibold" style={{ color: CREAM }}>{scorecard.recommendation || "—"}</span>
        <span style={{ color: MUTED_LIGHT }}>Confidence:</span>
        <span style={{ color: CREAM }}>{scorecard.interviewer_confidence || "—"}</span>
      </div>
      {scorecard.overall_notes && (
        <div className="rounded-lg p-3" style={{ backgroundColor: innerBg }}>
          <p className="text-xs font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Overall Notes</p>
          <p className="text-sm" style={{ color: CREAM }}>{scorecard.overall_notes}</p>
        </div>
      )}
    </div>
  );
}

export default function QuestionnaireUploader({ job, candidates, onUpdateJob, onUpdateCandidate, preselectedCandidateId }) {
  const [selectedCandidateId, setSelectedCandidateId] = useState(preselectedCandidateId || "");
  const [mode, setMode] = useState(null); // null | "r1_fill" | "r1_view" | "r2_fill" | "r2_view" | "r2_gen_text" | "r2_gen_file"
  const [text, setText] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [round2Questions, setRound2Questions] = useState(null);

  const template = job.scorecard_template || [];
  const selectedCandidate = candidates?.find(c => c.id === selectedCandidateId) || null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFileUrl(file_url);
    } catch (_) { setError("Failed to upload file"); }
    setLoading(false);
  };

  const handleParse = async () => {
    setLoading(true); setError(null); setParsed(null);
    try {
      let result;
      if (mode === "r2_gen_file") {
        if (!fileUrl) throw new Error("Upload a file first");
        result = await parseQuestionnaireFile(fileUrl, job, job.role_success_profile);
      } else {
        if (!text.trim()) throw new Error("Paste questionnaire text first");
        result = await parseQuestionnaireText(text, job, job.role_success_profile);
      }
      setParsed(result?.questions || []);
    } catch (_) { setError("Failed to parse questionnaire"); }
    setLoading(false);
  };

  const handleSaveTemplate = async (questions) => {
    setLoading(true);
    try {
      await onUpdateJob({ scorecard_template: questions });
      setParsed(null); setRound2Questions(null); setMode(null); setText(""); setFileUrl("");
    } catch (_) { setError("Failed to save questionnaire"); }
    setLoading(false);
  };

  const handleClearTemplate = async () => {
    setLoading(true);
    try { await onUpdateJob({ scorecard_template: [] }); } catch (_) {}
    setLoading(false);
  };

  const handleGenerateRound2 = async () => {
    setLoading(true); setError(null); setRound2Questions(null);
    try {
      const questions = await generateRound2Questions(job);
      setRound2Questions(questions);
    } catch (_) { setError("Failed to generate Round 2 questions"); }
    setLoading(false);
  };

  const reevaluateCandidate = async (updated) => {
    try {
      const interviews = [];
      if (updated.round1_scorecard) interviews.push({ ...updated.round1_scorecard, type: "Round 1 — General Competency" });
      if (updated.round2_scorecard) interviews.push({ ...updated.round2_scorecard, type: "Round 2 — Role-Specific" });
      const evaluation = await evaluateCandidate(updated, job, job?.role_success_profile, interviews, updated.resume_analysis);
      await onUpdateCandidate(updated.id, { evaluation });
    } catch (_) {}
  };

  const handleRound1Submit = async (result) => {
    if (!selectedCandidate) return;
    const updated = { ...selectedCandidate, round1_scorecard: result };
    await onUpdateCandidate(selectedCandidate.id, { round1_scorecard: result });
    setMode(null);
    await reevaluateCandidate(updated);
  };

  const handleRound2Submit = async (result) => {
    if (!selectedCandidate) return;
    const updated = { ...selectedCandidate, round2_scorecard: result };
    await onUpdateCandidate(selectedCandidate.id, { round2_scorecard: result });
    setMode(null);
    await reevaluateCandidate(updated);
  };

  // ---- Render ----

  // Candidate dropdown
  const dropdownCard = (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4" style={{ color: GOLD }} />
        <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Select Applicant</h4>
      </div>
      {(!candidates || candidates.length === 0) ? (
        <p className="text-sm" style={{ color: MUTED_LIGHT }}>No applicants yet. Add candidates in the Candidates tab first.</p>
      ) : (
        <div className="relative">
          <select
            value={selectedCandidateId}
            onChange={e => { setSelectedCandidateId(e.target.value); setMode(null); }}
            className="w-full appearance-none rounded-lg px-4 py-2.5 pr-10 text-sm font-medium"
            style={{ backgroundColor: innerBg, color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}
          >
            <option value="" style={{ color: "#1A1A1A" }}>— Choose an applicant —</option>
            {candidates.map(c => (
              <option key={c.id} value={c.id} style={{ color: "#1A1A1A" }}>
                {c.name}{c.email ? ` (${c.email})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: GOLD }} />
        </div>
      )}
    </div>
  );

  if (!selectedCandidate) {
    return (
      <div className="space-y-4">
        {dropdownCard}
        <ScorecardGuide />
        <div style={cardStyle} className="text-center py-8">
          <p className="text-sm" style={{ color: MUTED_LIGHT }}>Select an applicant above to view or fill out their Round 1 and Round 2 scorecards.</p>
        </div>
        {/* Still show Round 2 template management even without a candidate selected */}
        <Round2TemplateSection
          template={template}
          loading={loading}
          error={error}
          mode={mode}
          setMode={setMode}
          text={text} setText={setText}
          fileUrl={fileUrl} setFileUrl={setFileUrl} handleFile={handleFile}
          handleParse={handleParse} parsed={parsed}
          handleSaveTemplate={handleSaveTemplate} handleClearTemplate={handleClearTemplate}
          handleGenerateRound2={handleGenerateRound2} round2Questions={round2Questions}
          onCancelRound2={() => { setRound2Questions(null); setMode(null); }}
        />
      </div>
    );
  }

  // If filling out a form, show it full-screen
  if (mode === "r1_fill") {
    return (
      <div className="space-y-4">
        {dropdownCard}
        <Round1ScorecardForm
          candidateName={selectedCandidate.name}
          initialData={selectedCandidate.round1_scorecard}
          onSubmit={handleRound1Submit}
          onCancel={() => setMode(null)}
        />
      </div>
    );
  }

  if (mode === "r2_fill") {
    return (
      <div className="space-y-4">
        {dropdownCard}
        <Round2ScorecardForm
          job={job}
          candidateName={selectedCandidate.name}
          onSubmit={handleRound2Submit}
          onCancel={() => setMode(null)}
        />
      </div>
    );
  }

  const r1 = selectedCandidate.round1_scorecard;
  const r2 = selectedCandidate.round2_scorecard;

  return (
    <div className="space-y-4">
      {dropdownCard}
      <ScorecardGuide />

      {/* Round 1 Scorecard */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Round 1 — General Competency Scorecard</h4>
            <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Communication, Confidence, Coachability, Work Ethic, Professionalism, Culture Fit</p>
          </div>
          {r1 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
              <CheckCircle2 className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>

        {r1 && mode !== "r1_view" ? (
          <>
            <ScorecardSummary scorecard={r1} sections={ROUND1_SECTIONS} />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setMode("r1_view")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>View Scorecard</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("r1_fill")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Re-submit</Button>
              <Button size="sm" variant="outline" onClick={() => downloadRound1FilledPdf(selectedCandidate.name, r1)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Download className="w-3 h-3 mr-1" /> Download Results PDF
              </Button>
            </div>
          </>
        ) : mode === "r1_view" && r1 ? (
          <>
            <ScorecardView scorecard={r1} />
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setMode(null)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>← Back</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("r1_fill")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Re-submit</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("r1_fill")} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              <ClipboardList className="w-4 h-4 mr-2" /> Fill Out In System
            </Button>
            <Button variant="outline" onClick={() => downloadRound1BlankPdf(selectedCandidate.name)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </div>
        )}
      </div>

      {/* Round 2 Template Management */}
      <Round2TemplateSection
        template={template}
        loading={loading}
        error={error}
        mode={mode}
        setMode={setMode}
        text={text} setText={setText}
        fileUrl={fileUrl} setFileUrl={setFileUrl} handleFile={handleFile}
        handleParse={handleParse} parsed={parsed}
        handleSaveTemplate={handleSaveTemplate} handleClearTemplate={handleClearTemplate}
        handleGenerateRound2={handleGenerateRound2} round2Questions={round2Questions}
        onCancelRound2={() => { setRound2Questions(null); setMode(null); }}
      />

      {/* Round 2 Scorecard (candidate-specific) */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Round 2 — Role-Specific Scorecard</h4>
            <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Deep-dive, job-specific questions from the Round 2 template above.</p>
          </div>
          {r2 && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
              <CheckCircle2 className="w-3 h-3" /> Submitted
            </span>
          )}
        </div>

        {template.length === 0 ? (
          <p className="text-sm" style={{ color: MUTED_LIGHT }}>Generate Round 2 questions in the template section above first.</p>
        ) : r2 && mode !== "r2_view" ? (
          <>
            <ScorecardSummary scorecard={r2} />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setMode("r2_view")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>View Scorecard</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("r2_fill")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Re-submit</Button>
              <Button size="sm" variant="outline" onClick={() => downloadRound2FilledPdf(job, selectedCandidate.name, r2)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <Download className="w-3 h-3 mr-1" /> Download Results PDF
              </Button>
            </div>
          </>
        ) : mode === "r2_view" && r2 ? (
          <>
            <ScorecardView scorecard={r2} />
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setMode(null)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>← Back</Button>
              <Button size="sm" variant="outline" onClick={() => setMode("r2_fill")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Re-submit</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("r2_fill")} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              <ClipboardList className="w-4 h-4 mr-2" /> Fill Out In System
            </Button>
            <Button variant="outline" onClick={() => downloadRound2BlankPdf(job, selectedCandidate.name)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: "#FCA5A5" }}>{error}</p>}
    </div>
  );
}

// --- Round 2 Template Section (job-level question management) ---
function Round2TemplateSection({ template, loading, error, mode, setMode, text, setText, fileUrl, setFileUrl, handleFile, handleParse, parsed, handleSaveTemplate, handleClearTemplate, handleGenerateRound2, round2Questions, onCancelRound2 }) {
  const isGenMode = mode === "r2_gen_text" || mode === "r2_gen_file";

  return (
    <div style={cardStyle}>
      <div className="mb-3">
        <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>Round 2 — Question Template</h4>
        <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>AI-generated deep-dive questions shared across all applicants. These pre-populate each candidate's Round 2 scorecard.</p>
      </div>

      {template.length > 0 && !isGenMode && !round2Questions ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: GOLD }}>
              <CheckCircle2 className="w-4 h-4" /> {template.length} questions saved
            </p>
            <Button size="sm" variant="outline" onClick={handleClearTemplate} disabled={loading} style={{ backgroundColor: "transparent", color: "#FCA5A5", border: "1px solid rgba(220,38,38,0.3)" }}>
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { setMode("r2_gen"); handleGenerateRound2(); }} disabled={loading} variant="outline" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Regenerate with AI
            </Button>
            <Button variant="outline" onClick={() => setMode("r2_gen_text")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <FileText className="w-4 h-4 mr-2" /> Replace via Text
            </Button>
            <Button variant="outline" onClick={() => setMode("r2_gen_file")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
              <Upload className="w-4 h-4 mr-2" /> Replace via File
            </Button>
          </div>
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
            <Button variant="outline" onClick={onCancelRound2} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
            <Button onClick={() => handleSaveTemplate(round2Questions)} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Save as Round 2 Template
            </Button>
          </div>
        </div>
      ) : mode === "r2_gen_text" ? (
        <div className="space-y-3">
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Paste your Round 2 questionnaire text here..." />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode(null); setText(""); }} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
            <Button onClick={handleParse} disabled={loading || !text.trim()} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Parse Questions
            </Button>
          </div>
        </div>
      ) : mode === "r2_gen_file" ? (
        <div className="space-y-3">
          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFile} className="text-sm" style={{ color: CREAM }} />
          {fileUrl && <p className="text-xs" style={{ color: GOLD }}>File uploaded. Click parse to extract questions.</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode(null); setFileUrl(""); }} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
            <Button onClick={handleParse} disabled={loading || !fileUrl} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Parse Questions
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setMode("r2_gen"); handleGenerateRound2(); }} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Generate with AI
          </Button>
          <Button variant="outline" onClick={() => setMode("r2_gen_text")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
            <FileText className="w-4 h-4 mr-2" /> Paste Text
          </Button>
          <Button variant="outline" onClick={() => setMode("r2_gen_file")} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
            <Upload className="w-4 h-4 mr-2" /> Upload File
          </Button>
        </div>
      )}

      {parsed && parsed.length > 0 && (
        <div className="mt-3 rounded-lg p-4 space-y-2" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <p className="font-semibold mb-2" style={{ color: CREAM }}>Parsed {parsed.length} questions. Review and save:</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {parsed.map((q, i) => (
              <div key={i} className="text-sm rounded p-2" style={{ backgroundColor: innerBg }}>
                <p className="font-medium" style={{ color: CREAM }}>{i + 1}. {q.question}</p>
                {q.competency && <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>Competency: {q.competency}</p>}
              </div>
            ))}
          </div>
          <Button onClick={() => handleSaveTemplate(parsed)} disabled={loading} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />} Save as Round 2 Template
          </Button>
        </div>
      )}
    </div>
  );
}