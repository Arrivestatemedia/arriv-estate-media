import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only notify for newly created open jobs
    if (event.type !== 'create' || data.status !== 'open') {
      return Response.json({ message: 'No notification needed' });
    }

    const job = data;

    // Fetch all media partners
    const allUsers = await base44.asServiceRole.entities.User.list();
    const mediaPartners = allUsers.filter(user => user.user_type === 'media_partner');

    if (mediaPartners.length === 0) {
      return Response.json({ message: 'No media partners to notify' });
    }

    // Send email to each media partner
    const emailPromises = mediaPartners.map(mediaPartner => {
      const jobType = job.type === 'photo' ? 'Photography' : job.type === 'video' ? 'Videography' : 'Photo & Video';
      const jobDate = new Date(job.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const emailBody = `
Hello ${mediaPartner.full_name},

A new job has been posted on Arriv that matches your profile!

📋 Job Details:
• Title: ${job.title}
• Type: ${jobType}
• Location: ${job.location}
• Date: ${jobDate}
• Time: ${job.start_time || 'TBD'}
• Pay Rate: $${job.pay_rate}
${job.package ? `• Package: ${job.package}` : ''}

${job.description ? `Description: ${job.description}` : ''}

Log in to your dashboard to view full details and book this job before someone else does!

Best regards,
The Arriv Team
      `.trim();

      return base44.asServiceRole.integrations.Core.SendEmail({
        to: mediaPartner.email,
        subject: `New Job Posted: ${job.title}`,
        body: emailBody,
        from_name: 'Arriv'
      }).then(() => {
        return base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'media_partner',
          recipient_email: mediaPartner.email,
          message_content: emailBody,
          subject: `New Job Posted: ${job.title}`,
          job_id: job.id,
          status: 'success'
        });
      }).catch((error) => {
        return base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'media_partner',
          recipient_email: mediaPartner.email,
          message_content: emailBody,
          subject: `New Job Posted: ${job.title}`,
          job_id: job.id,
          status: 'failed',
          error_message: error.message
        });
      });
    });

    await Promise.all(emailPromises);

    return Response.json({ 
      message: 'Notifications sent', 
      media_partners_notified: mediaPartners.length 
    });
  } catch (error) {
    console.error('Error notifying contractors:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});