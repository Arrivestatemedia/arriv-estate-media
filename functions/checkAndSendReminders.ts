import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all unpaid invoices
    const unpaidInvoices = await base44.asServiceRole.entities.Invoice.filter({
      payment_status: 'unpaid'
    });
    
    const now = new Date();
    
    for (const invoice of unpaidInvoices) {
      if (!invoice.email_sent_at) continue;
      
      // If job_id exists, verify the job still exists
      if (invoice.job_id) {
        const job = await base44.asServiceRole.entities.Job.read(invoice.job_id);
        if (!job) {
          // Job was deleted, skip this invoice reminder
          continue;
        }
      }
      
      const emailSentAt = new Date(invoice.email_sent_at);
      const hoursSinceEmail = (now - emailSentAt) / (1000 * 60 * 60);
      
      // Send 24h reminder
      if (hoursSinceEmail >= 24 && !invoice.reminder_1_sent_at) {
        await base44.asServiceRole.functions.invoke('sendInvoiceEmailViaGmail', {
          invoiceId: invoice.id,
          clientEmail: invoice.client_email,
          clientName: invoice.client_name.split(' ')[0],
          jobAddress: invoice.job_address,
          trackedLink: invoice.tracked_link_url,
          isReminder: true,
          reminderNumber: 2
        });
      }
      
      // Send 48h reminder
      if (hoursSinceEmail >= 48 && invoice.reminder_1_sent_at && !invoice.reminder_2_sent_at) {
        await base44.asServiceRole.functions.invoke('sendInvoiceEmailViaGmail', {
          invoiceId: invoice.id,
          clientEmail: invoice.client_email,
          clientName: invoice.client_name.split(' ')[0],
          jobAddress: invoice.job_address,
          trackedLink: invoice.tracked_link_url,
          isReminder: true,
          reminderNumber: 3
        });
      }
    }
    
    return Response.json({ success: true, processedCount: unpaidInvoices.length });
    
  } catch (error) {
    console.error('Error checking reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});