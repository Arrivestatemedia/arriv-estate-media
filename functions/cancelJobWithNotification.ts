import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, reason } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job
    const job = await base44.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.booked_by !== user.email) {
      return Response.json({ error: 'You can only cancel your own bookings' }, { status: 403 });
    }

    // If there's a backup, assign them as primary
    if (job.backup_booked_by) {
      // Update job
      await base44.entities.Job.update(jobId, {
        ...job,
        booked_by: job.backup_booked_by,
        booked_by_name: job.backup_booked_by_name,
        backup_booked_by: null,
        backup_booked_by_name: null,
        status: "booked",
      });

      // Send email to backup contractor using Gmail
      const adminEmail = 'BradCBurke@arrivestatemedia.com';
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

      const emailSubject = `You've been assigned to: ${job.title}`;
      const emailBody = `Hi ${job.backup_booked_by_name},\n\nGreat news! The primary contractor for "${job.title}" has cancelled, and you've been assigned as the main contractor for this job.\n\nProperty: ${job.location}\nDate: ${job.date}\nTime: ${job.start_time}\nPay: $${job.pay_rate}\n\nPlease confirm your availability.\n\nThank you,\nArriv Team`;

      const messageLines = [
        `To: ${job.backup_booked_by}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];

      const messageParts = messageLines.map(line => new TextEncoder().encode(line + '\r\n'));
      const messageBytes = messageParts.reduce((acc, part) => {
        const newAcc = new Uint8Array(acc.length + part.length);
        newAcc.set(acc);
        newAcc.set(part, acc.length);
        return newAcc;
      }, new Uint8Array());

      const base64urlMessage = btoa(String.fromCharCode(...messageBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64urlMessage })
      });
    } else {
      // No backup, just return to open
      await base44.entities.Job.update(jobId, {
        ...job,
        booked_by: null,
        booked_by_name: null,
        status: "open",
      });
    }

    return Response.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});