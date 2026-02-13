import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { media_partner_email, media_partner_name, payout_date, period_start, period_end, gigs_completed, gross_amount, payout_method, payout_destination } = body;

    // Create PDF
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text('Payment Statement', 20, 20);
    
    doc.setFontSize(10);
    doc.text('Arriv Estate Media LLC', 20, 30);
    
    // Details
    const details = [
      ['Media Partner:', media_partner_name],
      ['Email:', media_partner_email],
      ['', ''],
      ['Payment Period:', `${period_start} to ${period_end}`],
      ['Payout Date:', payout_date],
      ['', ''],
      ['Gigs Completed:', gigs_completed.toString()],
      ['Gross Amount:', `$${gross_amount.toFixed(2)}`],
      ['Payment Method:', payout_method === 'zelle' ? 'Zelle' : 'Bank Account'],
      ['Payout Destination:', payout_destination],
    ];

    let y = 50;
    details.forEach(([label, value]) => {
      if (label === '') {
        y += 5;
        return;
      }
      doc.setFont(undefined, 'bold');
      doc.text(label, 20, y);
      doc.setFont(undefined, 'normal');
      doc.text(value, 80, y);
      y += 8;
    });

    const pdfBytes = doc.output('arraybuffer');
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    
    // Upload the PDF
    const uploadRes = await base44.integrations.Core.UploadFile({
      file: pdfBlob
    });

    return Response.json({
      success: true,
      pdf_url: uploadRes.file_url
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});