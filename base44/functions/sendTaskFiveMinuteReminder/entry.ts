import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import PDFDocument from 'npm:pdfkit@0.15.0';

async function generateCallMapPDF(repName, contactName, callTime, callMapContent) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.toString('base64'));
    });
    doc.on('error', reject);

    const GOLD = '#B8956A';
    const BLACK = '#1A1A1A';
    const GRAY = '#666666';
    const pageWidth = 612 - 100; // letter width minus margins

    // ── Header ──
    doc.rect(0, 0, 612, 90).fill('#1A1A1A');
    doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold')
      .text('CALL MAP', 50, 22, { width: pageWidth, align: 'center' });
    doc.fillColor(GOLD).fontSize(12).font('Helvetica')
      .text(`${repName}  ·  ${contactName}  ·  ${callTime} ET`, 50, 54, { width: pageWidth, align: 'center' });

    doc.y = 110;

    // Parse sections from markdown
    const lines = (callMapContent || '').split('\n');
    let i = 0;

    const renderSection = (title, body) => {
      if (doc.y > 680) doc.addPage();

      // Section title bar
      const titleY = doc.y;
      doc.rect(50, titleY, pageWidth, 22).fill(GOLD);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
        .text(title.trim(), 58, titleY + 6, { width: pageWidth - 16 });
      doc.y = titleY + 28;

      // Section body
      if (body.trim()) {
        doc.fillColor(BLACK).fontSize(10).font('Helvetica')
          .text(body.trim(), 58, doc.y, { width: pageWidth - 16, lineGap: 2 });
        doc.y += 8;
      }
      doc.y += 4;
    };

    // Group into sections
    let currentTitle = null;
    let currentBody = [];

    while (i < lines.length) {
      const line = lines[i];
      // Detect headers: lines starting with ###, **, emoji combos, or all-caps
      const isHeader = /^#{1,3}\s/.test(line) || /^\*\*[^*]/.test(line) ||
        /^[📞📧✅🔴📩🎯💡🔑🚫⏱️📱💼🏠📋🗓️]\s/.test(line);

      if (isHeader) {
        if (currentTitle !== null) {
          renderSection(currentTitle, currentBody.join('\n'));
        }
        // Clean up the title
        currentTitle = line
          .replace(/^#{1,3}\s+/, '')
          .replace(/\*\*/g, '')
          .replace(/^[-–—]\s+/, '')
          .trim();
        currentBody = [];
      } else if (line.trim() === '---' || line.trim() === '***') {
        // horizontal rule - skip
      } else {
        if (currentTitle !== null) {
          const cleaned = line.replace(/\*\*/g, '').trim();
          if (cleaned) currentBody.push(cleaned);
        }
      }
      i++;
    }

    // Flush last section
    if (currentTitle !== null) {
      renderSection(currentTitle, currentBody.join('\n'));
    }

    // If no sections were detected, just dump the text
    if (currentTitle === null && callMapContent) {
      doc.fillColor(BLACK).fontSize(10).font('Helvetica')
        .text(callMapContent.replace(/\*\*/g, '').trim(), 50, doc.y, { width: pageWidth, lineGap: 2 });
    }

    // ── Footer ──
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
      .text('ARRIV Estate Media  ·  Confidential', 50, 730, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

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

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

    const results = await Promise.allSettled(upcoming.map(async (activity) => {
      const callTime = new Date(activity.activity_date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
      const contact = activity.contact_name || activity.company_name || 'a contact';

      // Look up rep name
      let repName = 'there';
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: activity.sales_member_email });
        if (members.length > 0) repName = members[0].full_name || repName;
      } catch (_) {}

      // Extract call map from notes
      const notes = activity.notes || '';
      const mapMatch = notes.match(/--- CALL MAP ---\s*([\s\S]*)/i);
      const callMapContent = mapMatch ? mapMatch[1].trim() : notes;

      // Generate PDF
      const pdfBase64 = await generateCallMapPDF(repName, contact, callTime, callMapContent);

      // Send via Brevo
      const emailBody = {
        sender: { name: 'Arriv Estate Media', email: 'noreply@arrivestatemedia.com' },
        to: [{ email: activity.sales_member_email, name: repName }],
        subject: `⏰ Call Reminder: ${contact} at ${callTime}`,
        htmlContent: `<p>Hi ${repName},</p><p>You have a call at <strong>${callTime}</strong>. Please find your call map attached.</p><p>Good luck!</p><p>— Arriv Estate Media</p>`,
        attachment: [
          {
            content: pdfBase64,
            name: `Call_Map_${contact.replace(/\s+/g, '_')}.pdf`
          }
        ]
      };

      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify(emailBody)
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Brevo error: ${err}`);
      }

      return resp.json();
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);

    return Response.json({ success: true, sent, failed: results.length - sent, errors });
  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});