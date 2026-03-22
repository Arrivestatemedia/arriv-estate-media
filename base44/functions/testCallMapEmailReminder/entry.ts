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
    const pageWidth = 612 - 100;

    doc.rect(0, 0, 612, 90).fill('#1A1A1A');
    doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold')
      .text('CALL MAP', 50, 22, { width: pageWidth, align: 'center' });
    doc.fillColor(GOLD).fontSize(12).font('Helvetica')
      .text(`${repName}  ·  ${contactName}  ·  ${callTime} ET`, 50, 54, { width: pageWidth, align: 'center' });

    doc.y = 110;

    const lines = (callMapContent || '').split('\n');
    let currentTitle = null;
    let currentBody = [];

    const renderSection = (title, body) => {
      if (doc.y > 680) doc.addPage();
      const titleY = doc.y;
      doc.rect(50, titleY, pageWidth, 22).fill(GOLD);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
        .text(title.trim(), 58, titleY + 6, { width: pageWidth - 16 });
      doc.y = titleY + 28;
      if (body.trim()) {
        doc.fillColor(BLACK).fontSize(10).font('Helvetica')
          .text(body.trim(), 58, doc.y, { width: pageWidth - 16, lineGap: 2 });
        doc.y += 8;
      }
      doc.y += 4;
    };

    for (const line of lines) {
      const isHeader = /^#{1,3}\s/.test(line) || /^\*\*[^*]/.test(line) ||
        /^[📞📧✅🔴📩🎯💡🔑🚫⏱️📱💼🏠📋🗓️]\s/.test(line);

      if (isHeader) {
        if (currentTitle !== null) renderSection(currentTitle, currentBody.join('\n'));
        currentTitle = line.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/^[-–—]\s+/, '').trim();
        currentBody = [];
      } else if (line.trim() === '---' || line.trim() === '***') {
        // skip
      } else if (currentTitle !== null) {
        const cleaned = line.replace(/\*\*/g, '').trim();
        if (cleaned) currentBody.push(cleaned);
      }
    }

    if (currentTitle !== null) renderSection(currentTitle, currentBody.join('\n'));

    if (currentTitle === null && callMapContent) {
      doc.fillColor(BLACK).fontSize(10).font('Helvetica')
        .text(callMapContent.replace(/\*\*/g, '').trim(), 50, doc.y, { width: pageWidth, lineGap: 2 });
    }

    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
      .text('ARRIV Estate Media  ·  Confidential', 50, 730, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Find Chloe-Ray Iacob's upcoming call
    const all = await base44.asServiceRole.entities.ActivityLog.filter({
      contact_name: 'Chloe-Ray Iacob'
    }, 'activity_date', 50);

    // Find the upcoming one
    const now = new Date();
    const upcoming = all
      .filter(a => new Date(a.activity_date) > now)
      .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));

    if (upcoming.length === 0) {
      return Response.json({ error: 'No upcoming activities found for Chloe-Ray Iacob' });
    }

    const activity = upcoming[0];

    const callTime = new Date(activity.activity_date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York'
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

    const result = await resp.json();

    if (!resp.ok) {
      return Response.json({ error: result }, { status: 400 });
    }

    return Response.json({ 
      success: true, 
      sent_to: 'BradCBurke@arrivestatemedia.com',
      activity_id: activity.id,
      call_time: callTime,
      contact,
      has_call_map: !!mapMatch,
      brevo: result
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});