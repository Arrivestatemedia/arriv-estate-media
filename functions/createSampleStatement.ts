import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Generate sample PDF using service role
    const base44Service = createClientFromRequest(req);
    const pdfRes = await base44Service.asServiceRole.functions.invoke('generatePaymentStatement', {
      media_partner_email: 'ilimbooking@gmail.com',
      media_partner_name: 'Sample Media Partner',
      payout_date: '2026-02-13',
      period_start: '2026-02-08',
      period_end: '2026-02-12',
      gigs_completed: 5,
      gross_amount: 850.00,
      payout_method: 'zelle',
      payout_destination: 'ilimbooking@gmail.com'
    });

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
      pdf_url: pdfRes.data.pdf_url,
      is_archived: false
    });

    return Response.json({
      success: true,
      statement: statement
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});