import { jsPDF } from "jspdf";

const GOLD = [184, 149, 106];
const DARK = [26, 26, 26];

function groupBySection(questions) {
  const sections = {};
  questions.forEach(q => {
    const s = q.section || "General";
    if (!sections[s]) sections[s] = [];
    sections[s].push(q);
  });
  return sections;
}

/**
 * Generate a blank Round 2 scorecard PDF (for printing / manual fill).
 */
export function downloadRound2BlankPdf(job, candidateName) {
  const doc = new jsPDF();
  const template = job?.scorecard_template || [];

  // Header bar
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 251, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Round 2 — Role-Specific Scorecard", 20, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("Arriv Estate Media — HireIQ", 20, 21);

  // Job / candidate info
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Job: ${job?.title || ""}`, 20, 38);
  if (job?.department) doc.text(`Department: ${job.department}`, 20, 45);
  let y = job?.department ? 52 : 45;
  if (candidateName) {
    doc.text(`Candidate: ${candidateName}`, 20, y);
    y += 7;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, y);
  y += 4;
  doc.text(`Interviewer: ____________________________`, 20, y);
  y += 8;

  if (template.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No Round 2 questions generated yet.", 20, y);
    doc.save("Round2_Scorecard_Blank.pdf");
    return;
  }

  const sections = groupBySection(template);

  Object.entries(sections).forEach(([sectionName, questions]) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(sectionName, 17, y + 1);
    y += 8;

    questions.forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 175);
      doc.text(lines, 17, y);
      y += lines.length * 4.5;

      if (q.competency) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Competency: ${q.competency}`, 17, y);
        y += 4;
      }
      if (q.explanation) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        const expl = doc.splitTextToSize(`What to look for: ${q.explanation}`, 175);
        doc.text(expl, 17, y);
        y += expl.length * 4;
      }

      // Score row
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Score:  [1]  [2]  [3]  [4]  [5]", 17, y);
      doc.text("Notes:", 110, y);
      doc.setDrawColor(200, 200, 200);
      doc.line(128, y + 1, 195, y + 1);
      y += 10;
    });
    y += 4;
  });

  // Summary section
  if (y > 250) { doc.addPage(); y = 20; }
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

  doc.save(`Round2_Scorecard_${job?.title || "Template"}${candidateName ? "_" + candidateName.replace(/\s/g, "") : ""}.pdf`);
}

/**
 * Generate a filled-in Round 2 scorecard PDF from submitted results.
 */
export function downloadRound2FilledPdf(job, candidateName, scorecard) {
  const doc = new jsPDF();
  const template = job?.scorecard_template || [];
  const sections = scorecard?.sections || [];

  // Header bar
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 251, 245);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Round 2 — Scorecard Results", 20, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text("Arriv Estate Media — HireIQ", 20, 21);

  // Info
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Job: ${job?.title || ""}`, 20, 38);
  let y = 45;
  if (candidateName) {
    doc.text(`Candidate: ${candidateName}`, 20, y);
    y += 7;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${scorecard?.submitted_at ? new Date(scorecard.submitted_at).toLocaleDateString() : new Date().toLocaleDateString()}`, 20, y);
  y += 4;
  doc.text(`Total Score: ${scorecard?.total_score ?? "—"}/100`, 20, y);
  y += 4;
  doc.text(`Recommendation: ${scorecard?.recommendation || "—"}`, 20, y);
  y += 8;

  sections.forEach((sec) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFillColor(...GOLD);
    doc.rect(15, y - 4, 180, 7, "F");
    doc.setTextColor(255, 251, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${sec.name} — ${sec.score ?? "—"}/${sec.max_score ?? 100}`, 17, y + 1);
    y += 8;

    (sec.questions || []).forEach((q, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 175);
      doc.text(lines, 17, y);
      y += lines.length * 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text(`Score: ${q.score ?? "—"}/5`, 17, y);
      y += 5;

      if (q.notes) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(8);
        const notes = doc.splitTextToSize(`Notes: ${q.notes}`, 175);
        doc.text(notes, 17, y);
        y += notes.length * 4;
      }
      y += 4;
    });
    y += 3;
  });

  if (scorecard?.overall_notes) {
    if (y > 250) { doc.addPage(); y = 20; }
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