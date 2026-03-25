import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const GOLD = rgb(0.722, 0.584, 0.416);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.102, 0.102, 0.102);
const DARK = rgb(0.102, 0.102, 0.102);
const LIGHT_GOLD_BG = rgb(0.98, 0.96, 0.92);

const sanitize = (str) => (str || '')
  .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2300}-\u{23FF}]/gu, '')
  .replace(/[^\x20-\x7E]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function wrapText(text, font, size, maxW) {
  const words = sanitize(text).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxW && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function parseSections(content) {
  const sections = [];
  const rawLines = content.split('\n');
  let current = null;

  const isHeaderLine = (line) =>
    /^#{1,3}\s/.test(line) ||
    /^\*\*[A-Z]/.test(line) ||
    /^\p{Emoji}\s/u.test(line);

  for (const line of rawLines) {
    if (/^---+$/.test(line.trim())) continue;
    if (isHeaderLine(line)) {
      if (current) sections.push(current);
      let label = line
        .replace(/^#{1,3}\s+/, '')
        .replace(/\*\*/g, '')
        .replace(/^[-–—]\s+/, '')
        .trim();
      label = label.replace(/^[\p{Emoji}]\s*/u, '').trim();
      current = { label, body: [] };
    } else if (current) {
      const cleaned = line.replace(/\*\*/g, '').trim();
      if (cleaned) current.body.push(cleaned);
    }
  }
  if (current) sections.push(current);
  return sections;
}

async function generateCallMapPDF(repName, contactName, callTime, callMapContent) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageW = 612;
  const pageH = 792;
  const margin = 40;
  const contentW = pageW - margin * 2;

  const addPage = () => {
    const p = pdfDoc.addPage([pageW, pageH]);
    return { page: p, yPos: pageH - 50 };
  };

  let { page, yPos } = addPage();

  // Header
  page.drawRectangle({ x: 0, y: pageH - 80, width: pageW, height: 80, color: DARK });
  page.drawText('CALL MAP', { x: margin, y: pageH - 44, size: 24, font: boldFont, color: WHITE });
  page.drawText(sanitize(`${repName}  ·  ${contactName}  ·  ${callTime} ET`), {
    x: margin, y: pageH - 64, size: 10, font: regularFont, color: GOLD,
  });
  yPos = pageH - 98;

  const sections = parseSections(callMapContent);

  for (const section of sections) {
    const label = sanitize(section.label).slice(0, 90);
    const bodyText = section.body.map(l => sanitize(l)).filter(Boolean).join(' ');
    const bodyLines = bodyText ? wrapText(bodyText, regularFont, 9.5, contentW - 20) : [];

    const sectionHeight = 20 + (bodyLines.length * 13) + 12;

    if (yPos - sectionHeight < 50) {
      const next = addPage();
      page = next.page;
      yPos = next.yPos;
    }

    const cardTop = yPos;
    const cardHeight = sectionHeight;

    page.drawRectangle({
      x: margin, y: cardTop - cardHeight,
      width: contentW, height: cardHeight,
      color: LIGHT_GOLD_BG,
      borderColor: GOLD,
      borderWidth: 0.5,
    });

    page.drawRectangle({ x: margin, y: cardTop - 20, width: contentW, height: 20, color: GOLD });
    page.drawText(label, {
      x: margin + 8, y: cardTop - 14,
      size: 9, font: boldFont, color: WHITE,
      maxWidth: contentW - 16,
    });

    let textY = cardTop - 32;
    for (const line of bodyLines) {
      page.drawText(line, { x: margin + 10, y: textY, size: 9.5, font: regularFont, color: BLACK });
      textY -= 13;
    }

    yPos = cardTop - cardHeight - 8;
  }

  if (sections.length === 0 && callMapContent) {
    const plainLines = wrapText(callMapContent, regularFont, 10, contentW);
    for (const line of plainLines) {
      if (yPos < 50) { const next = addPage(); page = next.page; yPos = next.yPos; }
      page.drawText(line, { x: margin, y: yPos, size: 10, font: regularFont, color: BLACK });
      yPos -= 14;
    }
  }

  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  lastPage.drawText('ARRIV Estate Media  ·  Confidential', {
    x: margin, y: 24, size: 8, font: regularFont, color: rgb(0.6, 0.6, 0.6),
  });

  const pdfBytes = await pdfDoc.save();
  return btoa(String.fromCharCode(...pdfBytes));
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

      // Generate professional call map PDF using pdf-lib
      let pdfBase64 = null;
      if (callMapText) {
        try {
          pdfBase64 = await generateCallMapPDF(firstName, contact, time, callMapText);
          console.log(`✓ Generated PDF for ${contact}`);
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
        sender: { name: 'Arriv Estate Media', email: 'noreply@arrivestatemedia.com' },
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