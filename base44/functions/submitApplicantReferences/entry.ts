import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from "../../shared/brevoClient.ts";

function buildReferenceRequestHtml(referenceName, relationship, candidateFullName) {
  const questions = [
    "How do you know [CANDIDATE], and how long have you worked with them?",
    "What were their primary responsibilities?",
    "What would you say are their greatest strengths?",
    "How would you describe their communication and professionalism?",
    "How did they handle goals, deadlines, or performance expectations?",
    "Were they dependable and someone you could trust to follow through?",
    "How did they respond to coaching and feedback?",
    "What type of work environment do they thrive in?",
    "Is there anything you believe we should know before making a hiring decision?",
    "If given the opportunity, would you hire or work with them again? Why or why not?",
  ].map((q) => q.replace(/\[CANDIDATE\]/g, candidateFullName));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Hi ${referenceName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">I hope you're doing well. My name is Brad Burke, and I'm the Founder of Arriv Estate Media.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">${candidateFullName} recently interviewed with us for a Sales Growth Advisor position and listed you as a ${relationship}. With their permission, I'm reaching out to learn more about your experience working with them as we complete the final stages of our hiring process. Reference checks are commonly performed after successful interviews to help employers make informed hiring decisions.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you have 10&ndash;15 minutes, I'd appreciate your thoughts on a few questions:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
            ${questions.map((q) => `<tr><td style="padding:4px 0 4px 16px;font-size:15px;line-height:1.55;color:#1A1A1A;">&bull;&nbsp;&nbsp;${q}</td></tr>`).join("")}
          </table>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can simply reply to this email, or if it's easier, let me know a convenient time and phone number and I'd be happy to give you a quick call.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your time and for helping us make a thoughtful hiring decision. Your feedback will be kept confidential and used only as part of our evaluation process.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder<br/>Arriv Estate Media<br/>careers@arrivestatemedia.com<br/>678-242-9107</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Public endpoint (no auth) — applicants submit references via the link in the email.
// - GET-style call (body has only reference_id): returns request details without saving.
// - POST with references array: validates and stores the references.

function normalizeRef(r) {
  return {
    name: String(r?.name || "").trim(),
    email: String(r?.email || "").trim(),
    phone: String(r?.phone || "").trim(),
    relationship: String(r?.relationship || "").trim(),
    company: String(r?.company || "").trim(),
    years_known: String(r?.years_known || "").trim(),
    reference_type: r?.reference_type === "professional" ? "professional" : "character",
  };
}

function validRef(r) {
  return r.name && r.email && r.phone && r.relationship && r.years_known;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const referenceId = body?.reference_id;
    if (!referenceId) return Response.json({ error: "reference_id is required" }, { status: 400 });

    const records = await base44.asServiceRole.entities.ApplicantReference.filter({ reference_id: referenceId });
    const record = records && records[0];
    if (!record) return Response.json({ error: "This reference link is no longer valid." }, { status: 404 });

    // No references in the payload → return request details for the form.
    if (!Array.isArray(body?.references) || body.references.length === 0) {
      return Response.json({
        success: true,
        applicant_name: record.applicant_name,
        deadline: record.deadline,
        submitted: record.status === "submitted",
        submitted_at: record.submitted_at || null,
        references: record.references || [],
      });
    }

    if (record.status === "submitted") {
      return Response.json({ error: "References have already been submitted for this application." }, { status: 409 });
    }

    const refs = body.references.map(normalizeRef);
    if (refs.length !== 3) return Response.json({ error: "Please provide all 3 references." }, { status: 400 });
    for (const r of refs) {
      if (!validRef(r)) return Response.json({ error: "Please complete every field for each reference." }, { status: 400 });
    }
    const professionalCount = refs.filter((r) => r.reference_type === "professional").length;
    if (professionalCount < 2) return Response.json({ error: "At least 2 of your 3 references must be professional references." }, { status: 400 });

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.ApplicantReference.update(record.id, {
      references: refs,
      submitted_at: now,
      status: "submitted",
    });

    // Email each reference from careers@arrivestatemedia.com with Brad's reference questionnaire.
    const candidateFullName = record.applicant_name || "the candidate";
    const sent = [];
    for (const r of refs) {
      if (!r.email) continue;
      try {
        await sendBrevoEmail({
          to: r.email,
          senderEmail: "careers@arrivestatemedia.com",
          senderName: "Brad Burke — Arriv Estate Media",
          subject: `Reference request for ${candidateFullName}`,
          htmlContent: buildReferenceRequestHtml(r.name || "there", r.relationship || "reference", candidateFullName),
        });
        sent.push(r.email);
      } catch (e) {
        console.error("reference email failed:", r.email, e.message);
      }
    }

    return Response.json({ success: true, submitted_at: now, reference_emails_sent: sent });
  } catch (error) {
    console.error("submitApplicantReferences error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});