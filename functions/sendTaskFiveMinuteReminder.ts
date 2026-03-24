import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const windowStart = new Date(now.getTime() + 4 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 9 * 60 * 1000);

    const activities = await base44.asServiceRole.entities.ActivityLog.filter({
      activity_date: { $gte: windowStart.toISOString(), $lte: windowEnd.toISOString() }
    });

    const upcoming = activities.filter(a => a.sales_member_email);

    if (upcoming.length === 0) {
      return Response.json({ success: true, sent: 0 });
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');

    const results = await Promise.allSettled(upcoming.map(async (activity) => {
      const time = new Date(activity.activity_date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
      const contact = activity.contact_name || activity.company_name || 'a contact';
      const type = activity.activity_type
        ? activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)
        : 'Task';

      const recipientName = activity.sales_member_email.split('@')[0].split('.')[0];
      const firstName = recipientName.charAt(0).toUpperCase() + recipientName.slice(1);

      // Extract call map from notes (strip it from main body)
      const rawNotes = activity.notes || '';
      const callMapMatch = rawNotes.match(/\n\n--- CALL MAP ---\s*([\s\S]*)/i);
      const callMapText = callMapMatch ? callMapMatch[1].trim() : null;
      const shortNotes = rawNotes.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();

      // Build HTML email body
      const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>You have a <strong>${type}</strong> with <strong>${contact}</strong> at <strong>${time} ET</strong>. Please find your call map attached.</p>
  <p>Good luck!</p>
</body>
</html>`;

      // If there's a call map, generate a PDF and attach it
      let attachments = [];
      if (callMapText) {
        try {
          const { jsPDF } = await import('npm:jspdf@2.5.1');
          const doc = new jsPDF({ unit: 'pt', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth();
          const margin = 50;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(26, 26, 26);
          doc.text(`Call Map: ${contact}`, margin, 60);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          doc.text(`${type} at ${time} ET`, margin, 80);

          doc.setDrawColor(184, 149, 106);
          doc.setLineWidth(1);
          doc.line(margin, 90, pageWidth - margin, 90);

          let y = 110;
          const lines = doc.splitTextToSize(callMapText, pageWidth - margin * 2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(50, 50, 50);

          for (const line of lines) {
            if (y > doc.internal.pageSize.getHeight() - 60) {
              doc.addPage();
              y = 50;
            }
            // Bold section headers (lines starting with **)
            if (/^\*\*/.test(line)) {
              doc.setFont('helvetica', 'bold');
              doc.text(line.replace(/\*\*/g, ''), margin, y);
              doc.setFont('helvetica', 'normal');
            } else {
              doc.text(line, margin, y);
            }
            y += 14;
          }

          const pdfBytes = doc.output('arraybuffer');
          const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
          const safeName = contact.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
          attachments = [{
            name: `Call_Map_${safeName}.pdf`,
            content: base64Pdf
          }];
        } catch (pdfErr) {
          console.warn('PDF generation failed:', pdfErr.message);
        }
      }

      // Send via Brevo
      const payload = {
        sender: { name: 'Arriv Estate Media', email: adminEmail },
        to: [{ email: activity.sales_member_email, name: firstName }],
        subject: `Call Reminder: ${contact} at ${time}`,
        htmlContent: htmlBody,
      };

      if (attachments.length > 0) {
        payload.attachment = attachments;
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Brevo error: ${err.message}`);
      }
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return Response.json({ success: true, sent, failed: results.length - sent });

  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});