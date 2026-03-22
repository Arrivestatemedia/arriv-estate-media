import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const GOLD = rgb(0.722, 0.584, 0.416);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.102, 0.102, 0.102);
const DARK = rgb(0.102, 0.102, 0.102);

const sanitize = (str) => (str || '')
  .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2300}-\u{23FF}]/gu, '')
  .replace(/[^\x20-\x7E]/g, '')
  .trim();

async function generateCallMapPDF(repName, contactName, callTime, callMapContent) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([612, 792]);
  const margin = 50;
  const contentWidth = 612 - margin * 2;

  // Header
  page.drawRectangle({ x: 0, y: 702, width: 612, height: 90, color: DARK });
  page.drawText('CALL MAP', { x: margin, y: 754, size: 26, font: boldFont, color: WHITE, maxWidth: contentWidth });
  page.drawText(sanitize(`${repName}  .  ${contactName}  .  ${callTime} ET`), {
    x: margin, y: 722, size: 11, font: regularFont, color: GOLD, maxWidth: contentWidth
  });

  let yPos = 685;

  const wrapText = (text, font, size, maxW) => {
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
  };

  const drawSectionHeader = (title) => {
    if (yPos < 80) { page = pdfDoc.addPage([612, 792]); yPos = 730; }
    yPos -= 6;
    page.drawRectangle({ x: margin, y: yPos - 6, width: contentWidth, height: 22, color: GOLD });
    page.drawText(sanitize(title).slice(0, 80), { x: margin + 8, y: yPos, size: 10, font: boldFont, color: WHITE });
    yPos -= 28;
  };

  const drawBodyText = (text) => {
    const lines = wrapText(text, regularFont, 10, contentWidth - 16);
    for (const line of lines) {
      if (yPos < 60) { page = pdfDoc.addPage([612, 792]); yPos = 730; }
      page.drawText(line, { x: margin + 8, y: yPos, size: 10, font: regularFont, color: BLACK });
      yPos -= 14;
    }
  };

  const inputLines = (callMapContent || '').split('\n');
  let currentTitle = null;
  let currentBodyLines = [];

  const flushSection = () => {
    if (currentTitle !== null) {
      drawSectionHeader(currentTitle);
      const body = currentBodyLines.filter(l => l.trim()).join(' ');
      if (body) drawBodyText(body);
      yPos -= 4;
    }
  };

  for (const line of inputLines) {
    const isHeader = /^#{1,3}\s/.test(line) || /^\*\*[^*]/.test(line) ||
      /^[\u{1F300}-\u{1FFFF}]\s/u.test(line);
    if (isHeader) {
      flushSection();
      currentTitle = line.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/^[-]/,'').trim();
      currentBodyLines = [];
    } else if (/^---+$/.test(line.trim())) {
      // skip
    } else if (currentTitle !== null) {
      const cleaned = line.replace(/\*\*/g, '').trim();
      if (cleaned) currentBodyLines.push(cleaned);
    }
  }
  flushSection();

  if (currentTitle === null && callMapContent) {
    drawBodyText(callMapContent.replace(/\*\*/g, '').replace(/^#{1,3}\s/gm, ''));
  }

  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  lastPage.drawText('ARRIV Estate Media  .  Confidential', {
    x: margin, y: 30, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5)
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