import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendWelcomeEmail } from '../../shared/brevoWelcomeEmail.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email, fullName, sample, bulk } = body;

    // Send a preview/sample to the admin
    if (sample) {
      const adminEmail = Deno.env.get("ADMIN_EMAIL");
      if (!adminEmail) return Response.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });
      await sendWelcomeEmail(adminEmail, fullName || "Jordan Sample");
      return Response.json({ success: true, sample: true, sentTo: adminEmail });
    }

    // Send to all existing applicants
    if (bulk) {
      const apps = await base44.asServiceRole.entities.JobApplication.filter({}, "-created_date", 1000);
      const results = [];
      for (const a of apps) {
        if (!a.email) continue;
        try {
          await sendWelcomeEmail(a.email, a.full_name);
          results.push({ email: a.email, ok: true });
        } catch (e) {
          results.push({ email: a.email, ok: false, error: e.message });
        }
      }
      const sentCount = results.filter((r) => r.ok).length;
      return Response.json({ success: true, bulk: true, total: results.length, sent: sentCount, results });
    }

    // Send to a single recipient
    if (!email) return Response.json({ error: "email is required" }, { status: 400 });
    await sendWelcomeEmail(email, fullName);
    return Response.json({ success: true, sentTo: email });

  } catch (error) {
    console.error("sendApplicationWelcomeEmail error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});