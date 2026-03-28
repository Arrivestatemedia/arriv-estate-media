import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId, pendingSignupId, userEmail, paymentIntentId, paidAt } = await req.json();

    // Get user data — try User entity first, fall back to PendingSignup
    let user = null;
    if (userId) {
      const users = await base44.asServiceRole.entities.User.filter({ id: userId });
      user = users[0];
    }
    if (!user && pendingSignupId) {
      const signups = await base44.asServiceRole.entities.PendingSignup.filter({ id: pendingSignupId });
      user = signups[0] || null;
    }
    if (!user && userEmail) {
      const signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: userEmail });
      user = signups[0] || null;
    }

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate amounts
    const baseAmount = 50;
    const gearBagAmount = user.addGearBag ? 50 : 0;
    const waterBottleAmount = user.addWaterBottle ? 40 : 0;
    const totalAmount = baseAmount + gearBagAmount + waterBottleAmount;

    const paidDate = new Date(paidAt);
    const formattedDate = paidDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const fileDate = paidDate.toISOString().split('T')[0];

    // Generate PDF with jsPDF
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 60;
    let y = 0;

    // Dark header bar
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageWidth, 80, 'F');

    // Fetch logo
    try {
      const logoRes = await fetch('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png');
      if (logoRes.ok) {
        const logoBuffer = await logoRes.arrayBuffer();
        const logoBytes = new Uint8Array(logoBuffer);
        let b64 = '';
        for (let i = 0; i < logoBytes.length; i += 1024) b64 += String.fromCharCode(...logoBytes.subarray(i, i + 1024));
        const logoBase64 = btoa(b64);
        const imgData = `data:image/png;base64,${logoBase64}`;
        const imgProps = doc.getImageProperties(imgData);
        const logoH = 60;
        const logoW = (imgProps.width / imgProps.height) * logoH;
        doc.addImage(imgData, 'PNG', margin, 10, logoW, logoH);
      }
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(184, 149, 106);
      doc.text('ARRIV', margin, 50);
    }

    // RECEIPT label in header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(184, 149, 106);
    doc.text('RECEIPT', pageWidth - margin, 50, { align: 'right' });

    y = 110;

    // Receipt details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Date: ${formattedDate}`, margin, y);
    doc.text(`Transaction ID: ${paymentIntentId}`, margin, y + 14);
    y += 40;

    // Bill To
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 26);
    doc.text('MEDIA PARTNER:', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(user.full_name, margin, y);
    y += 12;
    doc.text(user.email, margin, y);
    y += 30;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Items header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(184, 149, 106);
    doc.text('ITEMS', margin, y);
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text('Description', margin, y);
    doc.text('Amount', pageWidth - margin, y, { align: 'right' });
    y += 8;
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    // Line items
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Media Partner Onboarding Fee (Shirt & Jacket)', margin, y);
    doc.text(`$${baseAmount}.00`, pageWidth - margin, y, { align: 'right' });
    y += 16;

    if (user.addGearBag) {
      doc.text('Gear Bag', margin, y);
      doc.text('$50.00', pageWidth - margin, y, { align: 'right' });
      y += 16;
    }

    if (user.addWaterBottle) {
      doc.text('Water Bottle', margin, y);
      doc.text('$40.00', pageWidth - margin, y, { align: 'right' });
      y += 16;
    }

    // Total
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text('TOTAL PAID:', margin, y);
    doc.setTextColor(184, 149, 106);
    doc.text(`$${totalAmount}.00`, pageWidth - margin, y, { align: 'right' });
    y += 30;

    // Apparel details
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(184, 149, 106);
    doc.text('APPAREL ORDER DETAILS', margin, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Shirt: ${user.shirtFit || ''} - Size ${user.shirtSize || ''}`, margin, y);
    y += 14;
    doc.text(`Jacket: Size ${user.jacketSize || ''}`, margin, y);
    y += 14;
    if (user.addGearBag) { doc.text('Gear Bag: Included', margin, y); y += 14; }
    if (user.addWaterBottle) { doc.text('Water Bottle: Included', margin, y); y += 14; }

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFillColor(26, 26, 26);
    doc.rect(0, pageHeight - 50, pageWidth, 50, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(184, 149, 106);
    doc.text('Arriv Estate Media LLC | arrivestatemedia.com | 678-242-9107', pageWidth / 2, pageHeight - 22, { align: 'center' });

    const pdfBytes = new Uint8Array(doc.output('arraybuffer'));

    // Upload to Google Drive
    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
    const folderId = '1I0WK_dCcoI8U5DDHzJq-SGxsFean-rTk';
    const fileName = `${user.full_name} – Onboarding Receipt – ${fileDate}.pdf`;
    const boundary = 'boundary_arriv_onboarding';
    const enc = new TextEncoder();

    const metaJson = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/pdf' });
    const before = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
    const after = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(before.length + pdfBytes.length + after.length);
    body.set(before);
    body.set(pdfBytes, before.length);
    body.set(after, before.length + pdfBytes.length);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${driveToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData.error)}`);

    // Make public
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const driveUrl = `https://drive.google.com/file/d/${uploadData.id}/view`;

    return Response.json({ success: true, fileName, driveUrl });

  } catch (error) {
    console.error('Error generating receipt:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});