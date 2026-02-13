import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Generate sample PDF directly instead of invoking function
    const { jsPDF } = await import('npm:jspdf@4.0.0');
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Payment Statement', 20, 20);
    
    doc.setFontSize(10);
    doc.text('Arriv Estate Media LLC', 20, 30);
    
    const details = [
      ['Media Partner:', 'Sample Media Partner'],
      ['Email:', 'ilimbooking@gmail.com'],
      ['', ''],
      ['Payment Period:', '2026-02-08 to 2026-02-12'],
      ['Payout Date:', '2026-02-13'],
      ['', ''],
      ['Gigs Completed:', '5'],
      ['Gross Amount:', '$850.00'],
      ['Payment Method:', 'Zelle'],
      ['Payout Destination:', 'ilimbooking@gmail.com'],
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
    const pdfData = btoa(String.fromCharCode.apply(null, new Uint8Array(pdfBytes)));
    const pdfDataUrl = `data:application/pdf;base64,${pdfData}`;

    // Create payment statement record
    const statement = await base44.asServiceRole.entities.PaymentStatement.create({
      media_partner_email: 'ilimbooking@gmail.com',
      media_partner_name: 'Sample Media Partner',
      payout_date: '2026-02-13',
      period_start: '2026-02-08',
      period_end: '2026-02-12',
      gigs_completed: 5,
      gross_amount: 850.00,
      payout_method: 'zelle',
      payout_destination: 'ilimbooking@gmail.com',
      pdf_url: pdfDataUrl,
      is_archived: false
    });

    return Response.json({
      success: true,
      statement: statement
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});