import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const unpaidInvoices = await base44.asServiceRole.entities.Invoice.filter({
      payment_status: 'unpaid'
    });
    
    const now = new Date();
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    const adminEmail = 'BradCBurke@arrivestatemedia.com';

    for (const invoice of unpaidInvoices) {
      if (!invoice.email_sent_at) continue;

      // Skip if job was deleted
      if (invoice.job_id) {
        const job = await base44.asServiceRole.entities.Job.read(invoice.job_id);
        if (!job) continue;
      }

      // Skip if booking was deleted or cancelled
      if (invoice.booking_id) {
        const booking = await base44.asServiceRole.entities.Booking.read(invoice.booking_id);
        if (!booking || booking.status === 'cancelled' || booking.status === 'denied') continue;
      }

      const emailSentAt = new Date(invoice.email_sent_at);
      const hoursSinceEmail = (now - emailSentAt) / (1000 * 60 * 60);

      // Use the Google Drive link (the actual invoice PDF link)
      const invoiceLink = invoice.google_drive_unpaid_url || invoice.google_drive_paid_url || invoice.stripe_payment_link_url;
      if (!invoiceLink) continue;

      const firstName = invoice.client_name ? invoice.client_name.split(' ')[0] : 'there';

      const buildHtml = (reminderNum) => `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>This is a friendly reminder that your invoice for media services at <strong>${invoice.job_address}</strong> is still outstanding.</p>
  <p>Amount due: <strong>$${invoice.amount ? invoice.amount.toFixed(2) : '—'}</strong></p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${invoiceLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">👉 View Invoice</a>
  </p>
  <p>If you have any questions, feel free to reach out.</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;

      // Send 24h reminder
      if (hoursSinceEmail >= 24 && !invoice.reminder_1_sent_at) {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
            to: [{ email: invoice.client_email, name: invoice.client_name }],
            subject: `Reminder: Invoice for ${invoice.job_address}`,
            htmlContent: buildHtml(1)
          })
        });
        if (brevoRes.ok) {
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            reminder_1_sent_at: new Date().toISOString()
          });
          console.log('24h reminder sent for invoice:', invoice.id);
        } else {
          const err = await brevoRes.json();
          console.error('Brevo 24h reminder error:', err);
        }
      }

      // Send 48h reminder
      if (hoursSinceEmail >= 48 && invoice.reminder_1_sent_at && !invoice.reminder_2_sent_at) {
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Bradley Burke - Arriv Estate Media', email: adminEmail },
            to: [{ email: invoice.client_email, name: invoice.client_name }],
            subject: `Final Reminder: Invoice for ${invoice.job_address}`,
            htmlContent: buildHtml(2)
          })
        });
        if (brevoRes.ok) {
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            reminder_2_sent_at: new Date().toISOString()
          });
          console.log('48h reminder sent for invoice:', invoice.id);
        } else {
          const err = await brevoRes.json();
          console.error('Brevo 48h reminder error:', err);
        }
      }
    }
    
    return Response.json({ success: true, processedCount: unpaidInvoices.length });
    
  } catch (error) {
    console.error('Error checking reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});