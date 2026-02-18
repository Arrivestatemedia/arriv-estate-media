import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId, clientEmail, clientName, jobAddress, trackedLink, isReminder, reminderNumber } = await req.json();
    
    console.log('Email params:', { invoiceId, clientEmail, clientName, jobAddress, trackedLink });
    
    let subject = 'Your Invoice from Arriv Estate Media';
    
    if (isReminder) {
      subject = `Reminder: Invoice for ${jobAddress}`;
    }
    
    const emailBody = `Hi ${clientName},

Your invoice for media services at ${jobAddress} is ready. Please use the link below to view the invoice and submit payment at your convenience.

👉 View Invoice: ${trackedLink}

If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

Best regards,
Bradley Burke
Arriv Estate Media
📞 678-242-9107
🌐 arrivestatemedia.com`;

    console.log('Sending email via Core.SendEmail to:', clientEmail);
    
    // Use Base44's built-in SendEmail integration
    const emailResult = await base44.asServiceRole.integrations.Core.SendEmail({
      to: clientEmail,
      subject,
      body: emailBody,
      from_name: 'Arriv Estate Media'
    });
    
    console.log('Email sent successfully');
    
    // Update invoice record
    const updateData = {
      email_sent_at: new Date().toISOString()
    };
    
    if (isReminder) {
      if (reminderNumber === 2) {
        updateData.reminder_1_sent_at = new Date().toISOString();
      } else if (reminderNumber === 3) {
        updateData.reminder_2_sent_at = new Date().toISOString();
      }
    }
    
    await base44.asServiceRole.entities.Invoice.update(invoiceId, updateData);
    
    // Log to HubSpot
    try {
      await base44.asServiceRole.functions.invoke('logHubSpotEvent', {
        contactEmail: clientEmail,
        eventType: isReminder ? 'reminder_sent' : 'email_sent',
        invoiceId,
        jobAddress,
        details: {
          subject,
          trackedLink,
          reminderNumber: isReminder ? reminderNumber : null
        }
      });
    } catch (hubspotError) {
      console.error('HubSpot logging error:', hubspotError.message);
    }
    
    return Response.json({ success: true });
    
  } catch (error) {
    console.error('Error sending email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});