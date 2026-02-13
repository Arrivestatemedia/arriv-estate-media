import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      media_partner_email, 
      media_partner_name, 
      file_url, 
      file_name, 
      payment_period_start, 
      payment_period_end, 
      payout_date, 
      total_gross_paid 
    } = body;

    // Validate required fields
    if (!media_partner_email || !media_partner_name || !file_url || !file_name || !payment_period_start || !payment_period_end || !payout_date) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the year from the payout date
    const payoutDate = new Date(payout_date);
    const year = payoutDate.getFullYear();

    // Create the payment statement record
    const statement = await base44.asServiceRole.entities.PaymentStatement.create({
      media_partner_email,
      media_partner_name,
      file_url,
      file_name,
      payment_period_start,
      payment_period_end,
      payout_date,
      total_gross_paid: total_gross_paid || 0,
      year,
      is_archived: false
    });

    return Response.json({ 
      success: true, 
      message: 'Payment statement uploaded successfully',
      statement_id: statement.id 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});