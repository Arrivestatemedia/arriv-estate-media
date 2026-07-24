import { jsPDF } from "jspdf";

export const OFFER_LETTER_BODY = [
  "Congratulations!",
  "",
  "We're excited to offer you the position of Sales Growth Advisor with Arriv Estate Media.",
  "",
  "After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team. We're looking forward to having you help us grow Arriv as we continue expanding across new markets.",
  "",
  "Your Offer",
  "",
  "As a Sales Growth Advisor, you'll play an important role in introducing Arriv Estate Media to real estate professionals and helping us build lasting relationships with new clients.",
  "",
  "Position: Sales Growth Advisor",
  "Employment Type: Independent Contractor (1099)",
  "Compensation: Commission-based, plus a $500 training bonus after successfully completing your first two weeks of training and meeting the program requirements.",
  "",
  "Next Steps",
  "",
  "Please review and respond to your offer within 7 days. If you need additional time or have any questions before making your decision, simply reply to this email — we're happy to help.",
  "",
  "We're excited about the possibility of working together and can't wait to see the impact you'll make as part of the Arriv team.",
  "",
  "Welcome to Arriv!",
  "",
  "Best regards,",
  "Brad Burke",
  "Founder & CEO",
  "Arriv Estate Media",
];

export function downloadOfferPdf(application) {
  const doc = new jsPDF();
  const firstName = (application.full_name || "").split(" ")[0] || "Candidate";
  let y = 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Arriv Estate Media", 105, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text("Offer of Independent Contractor Engagement", 105, y, { align: "center" });
  doc.setTextColor(20);
  y += 16;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Hi ${firstName},`, 20, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  OFFER_LETTER_BODY.forEach((line) => {
    const isHeading = ["Your Offer", "Next Steps", "Welcome to Arriv!", "Best regards,"].includes(line);
    if (isHeading) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    if (line === "") {
      y += 5;
    } else {
      const wrapped = doc.splitTextToSize(line, 170);
      doc.text(wrapped, 20, y);
      y += 6 * wrapped.length;
    }
    if (y > 270) { doc.addPage(); y = 30; }
  });

  doc.setFontSize(9);
  doc.setTextColor(150);
  if (application.offer_accepted_at) {
    doc.text(`Accepted on ${new Date(application.offer_accepted_at).toLocaleString()}`, 20, 285);
  }

  doc.save("Arriv-Sales-Growth-Advisor-Offer.pdf");
}