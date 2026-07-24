import { jsPDF } from "jspdf";

const ICA_CLAUSES = [
  ["1. Engagement", "Contractor agrees to perform sales growth advisory services for Arriv Estate Media, LLC (\"Company\"), introducing Company's media services to real estate professionals and building client relationships on a non-exclusive basis."],
  ["2. Independent Contractor Status", "Contractor is an independent contractor, not an employee, agent, or partner of Company. Contractor is responsible for their own taxes, including self-employment taxes, and will receive a Form 1099 as required. No benefits, Workers' Compensation, or unemployment coverage is provided."],
  ["3. Compensation", "Contractor is compensated on a commission basis as described in the Company's current commission schedule, plus a $500 training bonus after successfully completing the first two weeks of training and meeting program requirements."],
  ["4. Term and Termination", "This Agreement is effective upon acceptance and continues until terminated by either party with written notice. Upon termination, Contractor is entitled to commission earned on closed deals prior to termination."],
  ["5. Compliance with Laws", "Contractor agrees to comply with all applicable laws and Company policies, including those regarding professional conduct and anti-spam regulations."],
  ["6. Confidentiality", "Contractor agrees to keep confidential all proprietary Company information, including client lists, pricing, and training materials."],
  ["7. Entire Agreement", "This Agreement represents the entire agreement between the parties and may be amended only in writing by Company."],
];

export function downloadIcaPdf(onboarding, application) {
  const doc = new jsPDF();
  let y = 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Independent Contractor Agreement", 105, y, { align: "center" });
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Version ${onboarding.ica_version || ""}`, 105, y, { align: "center" });
  doc.setTextColor(20);
  y += 12;

  doc.setFontSize(11);
  doc.text(`This Independent Contractor Agreement is entered into between Arriv Estate Media, LLC ("Company") and ${onboarding.full_name || application.full_name || "Contractor"} ("Contractor").`, 20, y, { maxWidth: 170 });
  y += 22;

  ICA_CLAUSES.forEach(([title, body]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, 20, y, { maxWidth: 170 });
    y += 7;
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(body, 170);
    doc.text(wrapped, 20, y);
    y += 6 * wrapped.length + 5;
    if (y > 250) { doc.addPage(); y = 30; }
  });

  if (y > 240) { doc.addPage(); y = 30; }
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Contractor Acceptance", 20, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(`Signed: ${onboarding.ica_signature || onboarding.full_name || ""}`, 20, y);
  y += 8;
  doc.text(`Date: ${onboarding.ica_signed_at ? new Date(onboarding.ica_signed_at).toLocaleString() : ""}`, 20, y);

  doc.save("Arriv-Independent-Contractor-Agreement.pdf");
}

const TAX_LABELS = {
  individual_sole: "Individual/sole proprietor",
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  partnership: "Partnership",
  trust_estate: "Trust/estate",
  llc: "Limited Liability Company",
};

export function downloadW9Pdf(onboarding, application) {
  const doc = new jsPDF();
  let y = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Form W-9 (Contractor Record)", 105, y, { align: "center" });
  y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Request for Taxpayer Identification Number and Certification — Arriv Estate Media", 105, y, { align: "center" });
  doc.setTextColor(20);
  y += 14;

  doc.setFontSize(11);
  const rows = [
    ["Name (as shown on your income tax return)", onboarding.w9_legal_name || onboarding.full_name || ""],
    ["Business name / disregarded entity name (if any)", onboarding.w9_business_name || ""],
    ["Address (number, street, apt.)", onboarding.w9_address || ""],
    ["Federal tax classification", `${TAX_LABELS[onboarding.w9_tax_classification] || onboarding.w9_tax_classification || ""}${onboarding.w9_tax_classification === "llc" && onboarding.w9_llc_classification ? ` — ${onboarding.w9_llc_classification}` : ""}`],
    ["Taxpayer Identification Number (TIN)", onboarding.w9_tin || ""],
  ];
  rows.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label + ":", 20, y, { maxWidth: 80 });
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(val || "—", 80);
    doc.text(wrapped, 110, y);
    y += 6 + Math.max(0, (wrapped.length - 1) * 6) + 4;
  });

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Certification", 20, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  const cert = "Under penalties of perjury, I certify that the information provided on this form is true, correct, and complete.";
  doc.text(doc.splitTextToSize(cert, 170), 20, y);
  y += 16;
  doc.text(`Signature: ${onboarding.w9_signature || onboarding.full_name || ""}`, 20, y);
  y += 8;
  doc.text(`Date: ${onboarding.w9_completed_at ? new Date(onboarding.w9_completed_at).toLocaleString() : ""}`, 20, y);

  doc.save("Arriv-W9.pdf");
}