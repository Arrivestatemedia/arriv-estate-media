import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get Gmail OAuth access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all upcoming activities for today
    const allLogs = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500);

    const todayTasks = allLogs.filter(log => {
      const d = new Date(log.activity_date);
      return d >= today && d < tomorrow;
    });

    if (todayTasks.length === 0) {
      return Response.json({ sent: 0, message: "No tasks today" });
    }

    // Group by sales member
    const byMember = {};
    for (const task of todayTasks) {
      const email = task.sales_member_email;
      if (!email) continue;
      if (!byMember[email]) byMember[email] = [];
      byMember[email].push(task);
    }

    let sent = 0;
    for (const [email, tasks] of Object.entries(byMember)) {
      const taskRows = tasks.map(t => {
        const time = new Date(t.activity_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const contact = t.contact_name ? `<strong>${t.contact_name}</strong>` : '—';
        const company = t.company_name ? ` · ${t.company_name}` : '';
        const notes = t.notes ? `<br/><span style="color:#555;font-size:13px;">${t.notes.slice(0, 150)}</span>` : '';
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0e8dc;">
              <span style="background:#B8956A;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;text-transform:uppercase;">${t.activity_type}</span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0e8dc;color:#B8956A;font-weight:600;">${time}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0e8dc;">${contact}${company}${notes}</td>
          </tr>`;
      }).join('');

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8ddd0;">
          <div style="background:#1A1A1A;padding:24px 28px;">
            <p style="color:#B8956A;font-size:22px;font-style:italic;margin:0;font-weight:bold;">Arriv One</p>
            <p style="color:#FFFBF5;margin:4px 0 0;font-size:14px;">Daily Task Reminder</p>
          </div>
          <div style="padding:24px 28px;">
            <p style="font-size:15px;color:#1A1A1A;">You have <strong>${tasks.length} task${tasks.length > 1 ? 's' : ''}</strong> scheduled for today:</p>
            <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:14px;">
              <thead>
                <tr style="background:#f9f4ef;">
                  <th style="padding:8px 12px;text-align:left;color:#B8956A;font-size:11px;text-transform:uppercase;">Type</th>
                  <th style="padding:8px 12px;text-align:left;color:#B8956A;font-size:11px;text-transform:uppercase;">Time</th>
                  <th style="padding:8px 12px;text-align:left;color:#B8956A;font-size:11px;text-transform:uppercase;">Details</th>
                </tr>
              </thead>
              <tbody>${taskRows}</tbody>
            </table>
            <div style="margin-top:24px;text-align:center;">
              <a href="https://app.arrivestatemedia.com" style="background:#B8956A;color:#1A1A1A;text-decoration:none;padding:10px 24px;border-radius:8px;font-weight:600;font-size:14px;">Open Arriv One</a>
            </div>
          </div>
          <div style="background:#f9f4ef;padding:14px 28px;text-align:center;">
            <p style="color:#999;font-size:11px;margin:0;">This is an automated reminder from Arriv One · <a href="https://app.arrivestatemedia.com" style="color:#B8956A;">arrivestatemedia.com</a></p>
          </div>
        </div>`;

      // Build RFC 2822 email
      const subject = `📋 You have ${tasks.length} task${tasks.length > 1 ? 's' : ''} today — Arriv One`;
      const from = "Arriv One <info@arrivestatemedia.com>";
      const rawMessage = [
        `From: ${from}`,
        `To: ${email}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        htmlBody
      ].join('\r\n');

      const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });

      if (gmailRes.ok) {
        sent++;
      } else {
        const err = await gmailRes.json();
        console.error(`Failed to send to ${email}:`, err);
      }
    }

    return Response.json({ sent, total_tasks: todayTasks.length, message: `Emails sent to ${sent} reps via Gmail` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});