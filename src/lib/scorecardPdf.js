import { jsPDF } from "jspdf";
import { ROUND1_SECTIONS, ROUND1_ALL_QUESTIONS } from "@/lib/round1Questions";
import { normalizeQuestion } from "@/lib/scorecardScoring";

const GOLD = [184, 149, 106];
const DARK = [26, 26, 26];
const GRAY = [120, 120, 120];

function groupBySection(questions) {
  const sections = {};
  questions.forEach(q => {
    const s = q.section || "General";
    if (!sections[s]) sections[s] = [];
    sections[s].push(q);
  });
  return sections;
}

function ensureSpace(doc, y, needed = 20) {
  if (y > 280 - needed) { doc.addPage(); return 20; }
  return y;
}

function drawQuestionBlock(doc, q, index, y, isBlank) {
  const nq = normalizeQuestion(q);
  y = ensureSpace(doc, y, 30);

  // Question number and text
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(`${index + 1}. ${nq.question}`, 175);
  doc.text(lines, 17, y);
  y += lines.length * 4.5;

  // Competencies measured
  if (nq.competencies.length > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Competencies Measured: ${nq.competencies.join(", ")}`, 17, y);
    y += 4;
  }

  // Weight
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(`Weight: ${nq.weight}`, 17, y);
  y += 4;

  // Excellent answer guidance
  if (nq.excellent_answer) {
    y = ensureSpace(doc, y, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 110, 60);
    const exc = doc.splitTextToSize(`Excellent Answer: ${nq.excellent_answer}`, 175);
    doc.text(exc, 17, y);
    y += exc.length * 3.8;
  }

  // Poor answer guidance
  if (nq.poor_answer) {
    y = ensureSpace(doc, y, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 80, 80);
    const poor = doc.splitTextToSize(`Poor Answer: ${nq.poor_answer}`, 175);
    doc.text(poor, 17, y);
    y += poor.length * 3.8;
  }

  // Why this matters
  if (nq.why_this_matters) {
    y = ensureSpace(doc, y, 10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const why = doc.splitTextToSize(`Why This Matters: ${nq.why_this_matters}`, 175);
    doc.text(why, 17, y);
    y += why.length * 3.8;
  }

  y += 2;

  if (isBlank) {
    // Rating row
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Rating:  [1]  [2]  [3]  [4]  [5]", 17, y);
    y += 5;

    // Evidence observed
    doc.text("Evidence Observed:", 17, y);
    y += 4;
    for (let i = 0; i < 2; i++) {
      doc.setDrawColor(200, 200, 200);
      doc.line(17, y, 195, y);
      y += 5;
    }

    // Additional notes
    doc.text("Additional Notes:", 17, y);
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(17, y, 195, y);
    y += 8;
  } else {
    // Rating
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Rating: ${nq.rating || "—"}/5`, 17, y);
    y += 5;

    // Evidence observed
    if (nq.evidence) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      const ev = doc.splitTextToSize(`Evidence Observed: ${nq.evidence}`, 175);
      doc.text(ev, 17, y);
      y += ev.length * 3.8;
    }

    // Additional notes
    if (nq.notes) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const nt = doc.splitTextToSize(`Notes: ${nq.notes}`, 175);
      doc.text(nt, 17, y);
      y += nt.length * 3.8;
    }
    y += 5;
  }

  return y;
}

function drawSummarySection(doc, y, isBlank) {
  y = ensureSpace(doc, y, 30);
  doc.setFillColor(...DARK);
  doc.rect(15, y - 4, 180, 7, "F");
  doc.setTextColor(255, 251, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Overall Recommendation", 17, y + 1);
  y += 10;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Recommendation:  [ ] Strong Hire   [ ] Hire   [ ] Advance   [ ] Hold   [ ] No Hire", 17, y);
  y += 7;
  doc.text("Confidence:  [ ] Very Confident   [ ] Confident   [ ] Neutral   [ ] Unsure", 17, y);
  y += 7;
  doc.text("Overall Notes:", 17, y);
  y += 5;
  for (let i = 0; i < 4; i++) {
    doc.setDrawColor(200, 200, 200);
    doc.line(17, y, 195, y);
    y += 6;
  }
  return y;
}

function drawHeader(doc, title) {
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 251, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 20, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("Arriv Estate Media — Khetha IQ", 20, 21);
}

function drawScorecardGuide(doc, y) {
  y = ensureSpace(doc, y, 60);
  doc.setFillColor(245, 239, 233);
  doc.roundedRect(15, y - 4, 180, 4, 1, 1, "F");
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("How to Use This Scorecard", 17, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("Rating Scale (1-5):", 17, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  const ratings = [
    "1 = Poor: No evidence of this competency. Answer was vague, defensive, or missing.",
    "2 = Below Average: Weak or inconsistent evidence. Struggled to provide concrete examples.",
    "3 = Average: Adequate evidence. Basic example but lacked depth or impact.",
    "4 = Good: Strong evidence with a clear, specific example. Demonstrated the competency well.",
    "5 = Excellent: Exceptional evidence. Detailed, impactful example that exceeded expectations.",
  ];
  ratings.forEach(r => {
    const lines = doc.splitTextToSize(r, 175);
    doc.text(lines, 19, y);
    y += lines.length * 3.5;
  });
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("How Scores Are Calculated:", 17, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  const calc = [
    "Section Score (0-100): (weighted avg of question ratings / 5) x 100. Only rated questions count.",
    "Competency Score (0-100): (weighted avg of ratings from all questions measuring it / 5) x 100.",
    "Total Score (0-100): Weighted average of all section scores using each section's weight %.",
    "Question Weight: Default 1. Higher weights (2, 3) make critical questions count more.",
  ];
  calc.forEach(c => {
    const lines = doc.splitTextToSize(c, 175);
    doc.text(lines, 19, y);
    y += lines.length * 3.5;
  });
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("Evidence-Based Evaluation:", 17, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  const evalPts = [
    "- Evidence field is mandatory for any question rated above 0. Write what the candidate said or did.",
    "- Use the Excellent Answer and Poor Answer guidance as benchmarks for each rating.",
    "- Rate based on demonstrated evidence only, not assumptions or potential.",
  ];
  evalPts.forEach(e => {
    const lines = doc.splitTextToSize(e, 175);
    doc.text(lines, 19, y);
    y += lines.length * 3.5;
  });
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text("Two-Round System:", 17, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  const rounds = [
    "Round 1 - General Competency: Same 7 sections for all candidates (Communication, Confidence,",
    "  Coachability, Work Ethic, Professionalism, Problem Solving, Culture Fit). Assesses soft skills.",
    "Round 2 - Role-Specific: AI-generated deep-dive questions tailored to the job. Goes beyond",
    "  Round 1 with technical and situational questions.",
  ];
  rounds.forEach(r => {
    doc.text(r, 19, y);
    y += 3.5;
  });

  // Draw border around the whole guide
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.roundedRect(15, y - 52, 180, 52, 1, 1);

  return y + 6;
}

function drawInfoBlock(doc, job, candidateName, scorecard) {
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  let y = 38;
  if (job?.title) { doc.text(`Job: ${job.title}`, 20, y); y += 7; }
  if (job?.department) { doc.text(`Department: ${job.department}`, 20, y); y += 7; }
  if (candidateName) { doc.text(`Candidate: ${candidateName}`, 20, y); y += 7; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${scorecard?.submitted_at ? new Date(scorecard.submitted_at).toLocaleDateString() : new Date().toLocaleDateString()}`, 20, y);
  y += 5;
  if (scorecard?.total_score != null) {
    doc.text(`Total Score: ${scorecard.total_score}/100`, 20, y);
    y += 5;
  }
  if (scorecard?.recommendation) {
    doc.text(`Recommendation: ${scorecard.recommendation}`, 20, y);
    y += 5;
  }
  return y + 3;
}

// ===================== ROUND 1 PDFs =====================

export function downloadRound1BlankPdf(candidateName) {
  const doc = new jsPDF();
  drawHeader(doc, "Round 1 — General Competency Scorecard");

  let y = 38;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (candidateName) { doc.text(`Candidate: ${candidateName}`, 20, y); y += 7; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y);
  y += 4;
  doc.text(`Interviewer: ____________________________`, 20, y);
  y += 8;

  y = drawScorecardGuide(doc, y);

  ROUND1_SECTIONS.forEach(section => {
    y = ensureSpace(doc, y, 20);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${section.name} (Weight: ${section.weight}%)`, 17, y + 1);
    y += 8;

    section.questions.forEach((q, i) => {
      y = drawQuestionBlock(doc, { ...q, section: section.name }, i, y, true);
    });
    y += 4;
  });

  y = drawSummarySection(doc, y, true);
  doc.save(`Round1_Scorecard${candidateName ? "_" + candidateName.replace(/\s/g, "") : ""}.pdf`);
}

export function downloadRound1FilledPdf(candidateName, scorecard) {
  const doc = new jsPDF();
  drawHeader(doc, "Round 1 — Scorecard Results");

  let y = drawInfoBlock(doc, null, candidateName, scorecard);

  y = drawScorecardGuide(doc, y);

  // Competency scores
  if (scorecard?.competency_scores && Object.keys(scorecard.competency_scores).length > 0) {
    y = ensureSpace(doc, y, 15);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Competency Scores (Auto-Calculated)", 17, y + 1);
    y += 8;
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    Object.entries(scorecard.competency_scores).forEach(([comp, score]) => {
      doc.text(`${comp}: ${score}/100`, 17, y);
      y += 5;
    });
    y += 4;
  }

  (scorecard?.sections || []).forEach(sec => {
    y = ensureSpace(doc, y, 15);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${sec.name} — ${sec.score ?? "—"}/100 (Weight: ${sec.weight}%)`, 17, y + 1);
    y += 8;

    (sec.questions || []).forEach((q, i) => {
      y = drawQuestionBlock(doc, q, i, y, false);
    });
    y += 3;
  });

  if (scorecard?.overall_notes) {
    y = ensureSpace(doc, y, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("Overall Notes:", 17, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const notes = doc.splitTextToSize(scorecard.overall_notes, 175);
    doc.text(notes, 17, y);
  }

  doc.save(`Round1_Results${candidateName ? "_" + candidateName.replace(/\s/g, "") : ""}.pdf`);
}

// ===================== ROUND 2 PDFs =====================

export function downloadRound2BlankPdf(job, candidateName) {
  const doc = new jsPDF();
  drawHeader(doc, "Round 2 — Role-Specific Scorecard");

  let y = drawInfoBlock(doc, job, candidateName, null);
  y += 3;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Interviewer: ____________________________`, 20, y);
  y += 8;

  y = drawScorecardGuide(doc, y);

  const template = job?.scorecard_template || [];
  if (template.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No Round 2 questions generated yet.", 20, y);
    doc.save("Round2_Scorecard_Blank.pdf");
    return;
  }

  const sections = groupBySection(template);
  Object.entries(sections).forEach(([sectionName, questions]) => {
    y = ensureSpace(doc, y, 15);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(sectionName, 17, y + 1);
    y += 8;

    questions.forEach((q, i) => {
      y = drawQuestionBlock(doc, q, i, y, true);
    });
    y += 4;
  });

  y = drawSummarySection(doc, y, true);
  doc.save(`Round2_Scorecard_${job?.title || "Template"}${candidateName ? "_" + candidateName.replace(/\s/g, "") : ""}.pdf`);
}

export function downloadRound2FilledPdf(job, candidateName, scorecard) {
  const doc = new jsPDF();
  drawHeader(doc, "Round 2 — Scorecard Results");

  let y = drawInfoBlock(doc, job, candidateName, scorecard);

  y = drawScorecardGuide(doc, y);

  // Competency scores
  if (scorecard?.competency_scores && Object.keys(scorecard.competency_scores).length > 0) {
    y = ensureSpace(doc, y, 15);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Competency Scores (Auto-Calculated)", 17, y + 1);
    y += 8;
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    Object.entries(scorecard.competency_scores).forEach(([comp, score]) => {
      doc.text(`${comp}: ${score}/100`, 17, y);
      y += 5;
    });
    y += 4;
  }

  const sections = scorecard?.sections || [];
  sections.forEach((sec) => {
    y = ensureSpace(doc, y, 15);
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${sec.name} — ${sec.score ?? "—"}/${sec.max_score ?? 100}`, 17, y + 1);
    y += 8;

    (sec.questions || []).forEach((q, i) => {
      y = drawQuestionBlock(doc, q, i, y, false);
    });
    y += 3;
  });

  if (scorecard?.overall_notes) {
    y = ensureSpace(doc, y, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("Overall Notes:", 17, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const notes = doc.splitTextToSize(scorecard.overall_notes, 175);
    doc.text(notes, 17, y);
  }

  doc.save(`Round2_Results_${job?.title || ""}${candidateName ? "_" + candidateName.replace(/\s/g, "") : ""}.pdf`);
}