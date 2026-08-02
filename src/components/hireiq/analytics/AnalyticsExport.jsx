import React from "react";
import { Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import { CREAM, GOLD, MUTED_LIGHT, TEXT_DARK } from "./shared";
import { computeOverview, computeFunnel, computePredictionAccuracy, computeSourceEffectiveness, computeRetention, exportCSV } from "@/lib/analyticsEngine";

export default function AnalyticsExport({ data }) {
  const handleCSV = () => exportCSV(data);

  const handlePDF = () => {
    const overview = computeOverview(data);
    const funnel = computeFunnel(data);
    const prediction = computePredictionAccuracy(data);
    const sources = computeSourceEffectiveness(data);
    const retention = computeRetention(data);

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setTextColor(184, 149, 106);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("YouHireIQ Analytics Report", 14, 20);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 251, 245);
    doc.text(new Date().toLocaleDateString(), pageW - 50, 20);
    y = 40;

    const section = (title) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setTextColor(26, 26, 26);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, y);
      y += 6;
      doc.setDrawColor(184, 149, 106);
      doc.setLineWidth(0.5);
      doc.line(14, y, pageW - 14, y);
      y += 6;
    };

    const row = (label, value) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(label, 18, y);
      doc.setTextColor(26, 26, 26);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), pageW - 40, y);
      y += 5.5;
    };

    section("Hiring Overview");
    row("Open Jobs", overview.openJobs);
    row("Total Candidates", overview.totalCandidates);
    row("In Interview", overview.inInterview);
    row("Offers Extended", overview.offersExtended);
    row("Hires", overview.hires);
    row("Offer Acceptance Rate", `${overview.offerAcceptanceRate}%`);
    row("Avg Time to Fill", `${overview.timeToFill} days`);
    row("Application to Interview", `${overview.appToInterview} days`);
    row("Interview to Offer", `${overview.interviewToOffer} days`);
    y += 4;

    section("Hiring Funnel");
    funnel.forEach(s => row(s.name, `${s.count} (${s.conversion}% conv)`));
    y += 4;

    if (prediction) {
      section("AI Prediction Accuracy");
      row("Avg Predicted Score", `${prediction.avgPredicted}/100`);
      row("Avg Actual Performance", `${prediction.avgActual}/100`);
      row("Prediction Accuracy", `${prediction.accuracy}%`);
      row("Overestimated", prediction.overestimated);
      row("Underestimated", prediction.underestimated);
      row("Accurate Predictions", prediction.accurate);
      y += 4;
    }

    if (sources.length > 0) {
      section("Source Effectiveness");
      sources.forEach(s => row(`${s.label} (Apps/Hires)`, `${s.applications} / ${s.hires}`));
      y += 4;
    }

    if (retention) {
      section("Retention");
      row("30-Day Retention", `${retention.retention30}%`);
      row("90-Day Retention", `${retention.retention90}%`);
      row("6-Month Retention", `${retention.retention6mo}%`);
      row("1-Year Retention", `${retention.retention1yr}%`);
      row("Average Retention", `${retention.avgRetention} months`);
    }

    doc.save(`hireiq-analytics-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="flex gap-2">
      <button onClick={handlePDF}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)" }}>
        <FileText className="w-4 h-4" /> Export PDF
      </button>
      <button onClick={handleCSV}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)" }}>
        <Download className="w-4 h-4" /> Export CSV
      </button>
    </div>
  );
}