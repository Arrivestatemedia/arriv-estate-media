import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY not set');
    }

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

      const repEmail = activity.sales_member_email;
      
      // Look up the actual sales team member name
      let firstName = repEmail.split('@')[0];
      try {
        const salesMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: repEmail });
        if (salesMembers.length > 0 && salesMembers[0].full_name) {
          firstName = salesMembers[0].full_name.split(' ')[0];
        }
      } catch (e) {
        console.warn(`Could not look up sales member ${repEmail}, using email prefix`);
      }

      // Extract call map text - look for the structured call map sections
      const rawNotes = activity.notes || '';
      const callMapMatch = rawNotes.match(/\n\n--- CALL MAP ---\s*([\s\S]*)/i);
      const callMapText = callMapMatch ? callMapMatch[1].trim() : null;

      // Generate professional call map PDF
      let pdfBase64 = null;
      if (callMapText) {
        try {
          const { jsPDF } = await import('npm:jspdf@2.5.1');
          const doc = new jsPDF({ unit: 'pt', format: 'letter' });
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 50;

          // White page background
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');

          // Dark header bar
          doc.setFillColor(26, 26, 26);
          doc.rect(0, 0, pageWidth, 80, 'F');

          // "CALL MAP" title in white
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(28);
          doc.setTextColor(255, 255, 255);
          doc.text('CALL MAP', margin, 35);

          // Subtitle with rep name, contact, and time in gold
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(184, 149, 106);
          doc.text(`${firstName} ${contact} ${time}`, margin, 60);

          // Gold divider line
          doc.setDrawColor(184, 149, 106);
          doc.setLineWidth(2);
          doc.line(margin, 85, pageWidth - margin, 85);

          let y = 110;

          // Parse call map sections by looking for header patterns
          const lines = callMapText.split('\n').filter(l => l.trim());
          
          for (const line of lines) {
            if (y > pageHeight - 80) {
              doc.addPage();
              y = 50;
            }

            const trimmed = line.trim();
            if (!trimmed) continue;

            // Detect section headers
            const isHeader = /^(Opening|If |When |Follow-up|DuO|Du@)/i.test(trimmed) || 
                           (trimmed.length < 60 && /^[A-Z]/.test(trimmed) && !trimmed.includes('...'));

            if (isHeader) {
              // Draw section header with gold background
              const headerHeight = 18;
              doc.setFillColor(184, 149, 106);
              doc.rect(margin, y - 12, pageWidth - margin * 2, headerHeight, 'F');

              doc.setFont('helvetica', 'bold');
              doc.setFontSize(11);
              doc.setTextColor(255, 255, 255);
              doc.text(trimmed, margin + 8, y + 3);
              y += 28;
            } else {
              // Content text under section
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(80, 80, 80);
              
              const contentLines = doc.splitTextToSize(trimmed, pageWidth - margin * 2 - 16);
              for (const contentLine of contentLines) {
                if (y > pageHeight - 80) {
                  doc.addPage();
                  y = 50;
                }
                doc.text(contentLine, margin + 8, y);
                y += 14;
              }
              y += 8;
            }
          }

          // Footer
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text('ARRIV Estate Media · Confidential', pageWidth / 2, pageHeight - 20, { align: 'center' });

          const pdfBytes = new Uint8Array(doc.output('arraybuffer'));
          pdfBase64 = btoa(String.fromCharCode.apply(null, pdfBytes));
          console.log(`✓ Generated PDF (${pdfBytes.length} bytes) for ${contact}`);
        } catch (pdfErr) {
          console.error('PDF generation failed:', pdfErr.message);
        }
      }

      // Send via Brevo
      const htmlBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>You have a <strong>${type}</strong> with <strong>${contact}</strong> at <strong>${time} ET</strong>.</p>
  ${pdfBase64 ? '<p>Your call map is attached as a PDF.</p>' : ''}
  <p>Good luck!</p>
  <p style="color: #999; font-size: 12px;">— Arriv Estate Media</p>
</body>
</html>`;

      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      if (!brevoApiKey) {
        throw new Error('BREVO_API_KEY not set');
      }

      const safeName = contact.replace(/[^a-zA-Z0-9_-]/g, '').replace(/\s+/g, '_');
      const payload = {
        sender: { name: 'Arriv Estate Media', email: adminEmail },
        to: [{ email: repEmail, name: firstName }],
        subject: `Call Reminder: ${contact} at ${time}`,
        htmlContent: htmlBody,
        attachment: pdfBase64 ? [{
          name: `Call_Map_${safeName}.pdf`,
          content: pdfBase64
        }] : []
      };

      console.log(`Sending to ${repEmail}: ${contact} at ${time}, PDF attached: ${!!pdfBase64}`);

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) {
        console.error('Brevo error response:', resData);
        throw new Error(`Brevo error: ${resData.message || JSON.stringify(resData)}`);
      }

      console.log(`✓ Sent to ${repEmail}`);
      return { email: repEmail, success: true };
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return Response.json({ success: true, sent, failed });

  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});