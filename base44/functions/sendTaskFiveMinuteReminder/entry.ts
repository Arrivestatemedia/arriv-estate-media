import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
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
      let label = line.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/^[-–—]\s+/, '').trim();
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
  page.drawText(sanitize(`${repName}  .  ${contactName}  .  ${callTime} ET`), {
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

    page.drawRectangle({
      x: margin, y: cardTop - 20,
      width: contentW, height: 20,
      color: GOLD,
    });

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
  lastPage.drawText('ARRIV Estate Media  .  Confidential', {
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
    if (upcoming.length === 0) return Response.json({ success: true, sent: 0 });

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

    const results = await Promise.allSettled(upcoming.map(async (activity) => {
      const callTime = new Date(activity.activity_date).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
      });
      const contact = activity.contact_name || activity.company_name || 'a contact';

      let repName = 'there';
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: activity.sales_member_email });
        if (members.length > 0) repName = members[0].full_name?.split(' ')[0] || repName;
      } catch (_) {}

      const notes = activity.notes || '';
      const mapMatch = notes.match(/--- CALL MAP ---\s*([\s\S]*)/i);
      const callMapContent = mapMatch ? mapMatch[1].trim() : notes;

      const pdfBase64 = await generateCallMapPDF(repName, contact, callTime, callMapContent);

      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Arriv Estate Media', email: 'noreply@arrivestatemedia.com' },
          to: [{ email: activity.sales_member_email, name: repName }],
          subject: `Call Reminder: ${contact} at ${callTime}`,
          htmlContent: `<p>Hi ${repName},</p><p>You have a call at <strong>${callTime}</strong>. Please find your call map attached.</p><p>Good luck!</p><p>— Arriv Estate Media</p>`,
          attachment: [{ content: pdfBase64, name: `Call_Map_${contact.replace(/\s+/g, '_')}.pdf` }]
        })
      });

      if (!resp.ok) throw new Error(await resp.text());
      return resp.json();
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return Response.json({ success: true, sent, failed: results.length - sent });
  } catch (error) {
    console.error('Error sending 5-minute task reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});