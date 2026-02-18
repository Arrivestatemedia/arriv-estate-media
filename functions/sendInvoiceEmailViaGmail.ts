import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { invoiceId, clientEmail, clientName, jobAddress, trackedLink, isReminder, reminderNumber } = await req.json();
    
    // Get Gmail access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    
    let subject = 'Your Invoice from Arriv Estate Media';
    let bodyPrefix = '';
    
    if (isReminder) {
      subject = `Reminder: Invoice for ${jobAddress}`;
      if (reminderNumber === 2) {
        bodyPrefix = 'This is a friendly reminder that ';
      } else if (reminderNumber === 3) {
        bodyPrefix = 'Final reminder: ';
      }
    }
    
    const emailBody = `Hi ${clientName},

${bodyPrefix}${isReminder ? 'your' : 'Your'} invoice for media services at ${jobAddress} is ready. Please use the link below to view the invoice and submit payment at your convenience.

👉 View Invoice: ${trackedLink}

If you have any questions or need anything at all, feel free to reach out. Thank you again for the opportunity to work with you.

Best regards,
Bradley Burke
Arriv Estate Media
📞 678-242-9107
🌐 arrivestatemedia.com`;

    const message = [
      `To: ${clientEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailBody
    ].join('\r\n');
    
    const encodedMessage = btoa(unescape(encodeURIComponent(message)));
    
    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });
    
    const gmailData = await gmailResponse.json();
    
    if (!gmailResponse.ok) {
      throw new Error(`Gmail error: ${gmailData.error?.message || 'Unknown error'}`);
    }
    
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
    
    return Response.json({ success: true, messageId: gmailData.id });
    
  } catch (error) {
    console.error('Error sending email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});