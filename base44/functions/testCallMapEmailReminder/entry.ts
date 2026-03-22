import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const GOLD = rgb(0.722, 0.584, 0.416);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.102, 0.102, 0.102);
const DARK = rgb(0.102, 0.102, 0.102);
const LIGHT_GRAY = rgb(0.97, 0.97, 0.97);

async function generateCallMapPDF(repName, contactName, callTime, callMapContent) {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([612, 792]);
  const { width } = page.getSize();
  const margin = 50;
  const contentWidth = width - margin * 2;

  // ── Header bar ──
  page.drawRectangle({ x: 0, y: 702, width: 612, height: 90, color: DARK });
  page.drawText('CALL MAP', {
    x: margin, y: 754, size: 26, font: boldFont, color: WHITE,
    maxWidth: contentWidth
  });
  const subLine = `${repName}  ·  ${contactName}  ·  ${callTime} ET`;
  page.drawText(subLine, {
    x: margin, y: 722, size: 11, font: regularFont, color: GOLD,
    maxWidth: contentWidth
  });

  let yPos = 685;

  // Helper: wrap text into lines
  const wrapText = (text, font, size, maxW) => {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      const w = font.widthOfTextAtSize(test, size);
      if (w > maxW && current) {
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
    if (yPos < 80) {
      page = pdfDoc.addPage([612, 792]);
      yPos = 730;
    }
    yPos -= 6;
    page.drawRectangle({ x: margin, y: yPos - 6, width: contentWidth, height: 22, color: GOLD });
    page.drawText(title.slice(0, 80), {
      x: margin + 8, y: yPos, size: 10, font: boldFont, color: WHITE
    });
    yPos -= 28;
  };

  const stripEmoji = (str) => str.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]|[\u{2300}-\u{23FF}]/gu, '').trim();

  const drawBodyText = (text) => {
    const lines = wrapText(stripEmoji(text), regularFont, 10, contentWidth - 16);
    for (const line of lines) {
      if (yPos < 60) {
        page = pdfDoc.addPage([612, 792]);
        yPos = 730;
      }
      page.drawText(line, { x: margin + 8, y: yPos, size: 10, font: regularFont, color: BLACK });
      yPos -= 14;
    }
  };

  // Parse markdown sections
  const lines = (callMapContent || '').split('\n');
  let currentTitle = null;
  let currentBodyLines = [];

  const flushSection = () => {
    if (currentTitle !== null) {
      drawSectionHeader(stripEmoji(currentTitle));
      const body = currentBodyLines.filter(l => l.trim()).join(' ');
      if (body) drawBodyText(body);
      yPos -= 4;
    }
  };

  for (const line of lines) {
    const isHeader = /^#{1,3}\s/.test(line) || /^\*\*[^*]/.test(line) ||
      /^[📞📧✅🔴📩🎯💡🔑🚫⏱️📱💼🏠📋🗓️]\s/.test(line);

    if (isHeader) {
      flushSection();
      currentTitle = line.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/^[-–—]\s+/, '').trim();
      // Strip leading emoji
      currentTitle = currentTitle.replace(/^[\u{1F300}-\u{1FFFF}]\s*/u, '').trim();
      currentBodyLines = [];
    } else if (/^---+$/.test(line.trim())) {
      // skip
    } else if (currentTitle !== null) {
      const cleaned = line.replace(/\*\*/g, '').trim();
      if (cleaned) currentBodyLines.push(cleaned);
    }
  }
  flushSection();

  // If no sections found, dump raw text
  if (currentTitle === null && callMapContent) {
    const cleanText = callMapContent.replace(/\*\*/g, '').replace(/^#{1,3}\s/gm, '');
    drawBodyText(cleanText);
  }

  // Footer
  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  lastPage.drawText('ARRIV Estate Media  ·  Confidential', {
    x: margin, y: 30, size: 8, font: regularFont, color: rgb(0.5, 0.5, 0.5)
  });

  const pdfBytes = await pdfDoc.save();
  // Convert to base64
  const base64 = btoa(String.fromCharCode(...pdfBytes));
  return base64;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const all = await base44.asServiceRole.entities.ActivityLog.filter(
      { contact_name: 'Chloe-Ray Iacob' }, 'activity_date', 50
    );

    const now = new Date();
    const upcoming = all
      .filter(a => new Date(a.activity_date) > now)
      .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));

    if (upcoming.length === 0) {
      return Response.json({ error: 'No upcoming activities found for Chloe-Ray Iacob' });
    }

    const activity = upcoming[0];

    const callTime = new Date(activity.activity_date).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    });

    const repName = 'Brad';
    const contact = activity.contact_name || 'Chloe-Ray Iacob';

    const notes = activity.notes || '';
    const mapMatch = notes.match(/--- CALL MAP ---\s*([\s\S]*)/i);
    const callMapContent = mapMatch ? mapMatch[1].trim() : notes;

    const pdfBase64 = await generateCallMapPDF(repName, contact, callTime, callMapContent);

    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

    const emailBody = {
      sender: { name: 'Arriv Estate Media', email: 'noreply@arrivestatemedia.com' },
      to: [{ email: 'BradCBurke@arrivestatemedia.com', name: 'Brad Burke' }],
      subject: `⏰ [TEST] Call Reminder: ${contact} at ${callTime}`,
      htmlContent: `<p>Hi ${repName},</p><p>You have a call at <strong>${callTime}</strong>. Please find your call map attached.</p><p>Good luck!</p><p>— Arriv Estate Media</p>`,
      attachment: [{
        content: pdfBase64,
        name: `Call_Map_${contact.replace(/\s+/g, '_')}.pdf`
      }]
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

    const result = await resp.json();
    if (!resp.ok) return Response.json({ error: result }, { status: 400 });

    return Response.json({
      success: true,
      sent_to: 'BradCBurke@arrivestatemedia.com',
      call_time: callTime,
      contact,
      has_call_map: !!mapMatch,
      call_map_preview: callMapContent.slice(0, 200)
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});