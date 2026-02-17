import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, finalSalePrice, closingDate } = await req.json();
    
    // Get job details
    const jobs = await base44.asServiceRole.entities.Job.filter({ id: jobId });
    const job = jobs[0];
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Get original deposit invoice
    const depositInvoices = await base44.asServiceRole.entities.Invoice.filter({
      job_id: jobId,
      invoice_type: 'deposit'
    });
    const depositInvoice = depositInvoices[0];
    
    const payAtClosingRate = depositInvoice?.pay_at_closing_rate || 0.0008;
    const depositAmount = depositInvoice?.deposit_amount || 50;
    
    // Calculate final amount
    const totalFee = Math.round(finalSalePrice * payAtClosingRate * 100) / 100;
    const balanceDue = totalFee - depositAmount;
    
    // Generate invoice number
    const allInvoices = await base44.asServiceRole.entities.Invoice.list('-created_date', 1);
    const lastNumber = allInvoices.length > 0 && allInvoices[0].invoice_number 
      ? parseInt(allInvoices[0].invoice_number) 
      : 1000;
    const invoiceNumber = String(lastNumber + 1);
    
    // Create Stripe payment link for balance
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Final Payment - ${job.location}`,
        'line_items[0][price_data][unit_amount]': String(Math.round(balanceDue * 100)),
        'line_items[0][quantity]': '1',
      }),
    });
    
    const stripeData = await stripeResponse.json();
    
    // Create and upload invoice
    const trackToken = crypto.randomUUID();
    const trackedUrl = `${Deno.env.get('BASE44_APP_DOMAIN')}/t/${trackToken}`;
    
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      invoice_number: invoiceNumber,
      invoice_type: 'final_closing',
      job_id: jobId,
      client_name: job.client_name,
      client_email: job.client_email,
      job_address: job.location,
      service_date: job.date,
      package: job.package,
      add_ons: job.add_ons || [],
      amount: balanceDue,
      deposit_amount: depositAmount,
      payment_status: 'unpaid',
      stripe_payment_link_id: stripeData.id,
      stripe_payment_link_url: stripeData.url,
      tracked_link_token: trackToken,
      tracked_link_url: trackedUrl,
      pay_at_closing: true,
      closing_date: closingDate,
      final_sale_price: finalSalePrice,
      pay_at_closing_rate: payAtClosingRate
    });
    
    // Send email with closing congratulations
    await base44.asServiceRole.functions.invoke('sendClosingInvoiceEmail', {
      invoiceId: invoice.id,
      finalSalePrice,
      closingDate
    });
    
    return Response.json({ success: true, invoiceId: invoice.id });
    
  } catch (error) {
    console.error('Error generating final invoice:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});