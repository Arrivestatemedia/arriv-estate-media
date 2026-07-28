import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const sharedSecret = Deno.env.get("ARRIV_ESTATE_MEDIA_SECRET") || "";
    if (!sharedSecret) return Response.json({ error: "Notification secret not configured" }, { status: 500 });

    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || token !== sharedSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerPhone = Deno.env.get("OWNER_PHONE_NUMBER") || "";
    if (!ownerPhone) return Response.json({ error: "Owner phone not configured" }, { status: 500 });

    const raw = await req.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }

    const d = data || {};
    const event = d.event || d.type || d.notification_type || "payroll_update";
    const employee = d.employee_name || d.employee || d.name || "";
    const amount = d.gross_amount ?? d.amount ?? "";
    const status = d.payroll_status || d.status || "";
    const payDate = d.pay_date || d.scheduled_pay_date || "";

    let body = `Arriv Payroll: ${event}`;
    if (employee) body += ` — ${employee}`;
    if (amount !== "" && amount !== null) body += ` — $${amount}`;
    if (status) body += ` (${status})`;
    if (payDate) body += ` — pays ${payDate}`;

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
    const formData = new URLSearchParams({ From: fromNumber, To: ownerPhone, Body: body });

    const twRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    const twJson = await twRes.json();
    if (!twRes.ok) return Response.json({ error: twJson.message || "SMS failed" }, { status: 502 });

    return Response.json({ success: true, sid: twJson.sid });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});