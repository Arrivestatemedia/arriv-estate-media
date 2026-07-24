import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail, twilioSms } from '../../shared/backgroundCheck.ts';

const CHECKR_BASE = 'https://api.checkr.com/v1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { jobId, jobData, mediaPartnerEmail, bookJob = true } = body;
    if (!mediaPartnerEmail) return Response.json({ error: 'mediaPartnerEmail is required' }, { status: 400 });

    const apiKey = Deno.env.get('CHECKR_API_KEY');
    const checkrAuth = apiKey ? 'Basic ' + btoa(apiKey + ':') : null;
    const nowIso = new Date().toISOString();

    // Already cleared — just book if requested.
    if (user.background_check_status === 'clear') {
      if (bookJob && jobId && jobData) {
        await base44.asServiceRole.functions.invoke('bookJobAndSendCalendarInvite', { jobId, jobData, mediaPartnerEmail });
      }
      return Response.json({ success: true, alreadyCleared: true });
    }

    // Already authorized and pending with an invitation (automated mode) — reuse it.
    if (user.checkr_invitation_url && user.background_check_status === 'pending') {
      return Response.json({ success: true, invitation_url: user.checkr_invitation_url, reused: true });
    }

    // ---- MANUAL MODE (no Checkr API key configured yet) ----
    if (!apiKey) {
      await base44.asServiceRole.entities.User.update(user.id, {
        background_check_status: 'pending',
        background_check_authorized_at: nowIso,
        background_check_pending_job_id: jobId || null,
      });
      if (bookJob && jobId && jobData) {
        await base44.asServiceRole.functions.invoke('bookJobAndSendCalendarInvite', { jobId, jobData, mediaPartnerEmail });
      }

      // Notify admin to invite the candidate manually in the Checkr dashboard.
      const adminEmail = Deno.env.get('ADMIN_EMAIL');
      const adminPhone = Deno.env.get('ADMIN_PHONE') || '4047891107';
      let jobInfo = '';
      if (jobId) {
        try { const j = await base44.asServiceRole.entities.Job.get(jobId); jobInfo = `${j.title} — ${j.date}${j.start_time ? ' ' + j.start_time : ''} — ${j.location}`; } catch (e) { /* ignore */ }
      }
      await twilioSms(adminPhone, `Arriv: ${user.full_name} authorized a background check and needs a Checkr invite. Email: ${user.email}${user.phone_number ? ', Phone: ' + user.phone_number : ''}${jobInfo ? ', Gig: ' + jobInfo : ''}. Invite them in Checkr Dashboard > Candidates.`);

      if (adminEmail) {
        try {
          await sendBrevoEmail({
            to: adminEmail,
            subject: 'Action needed: invite a new media partner on Checkr',
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1A1A1A">
              <h2 style="color:#B8956A">Background check authorized</h2>
              <p>A media partner has authorized a background check and needs to be invited in Checkr.</p>
              <p style="background:#FFFBF5;border:1px solid #B8956A33;border-radius:8px;padding:12px 16px;">
                <strong>${user.full_name}</strong><br/>
                Email: ${user.email}<br/>
                ${user.phone_number ? 'Phone: ' + user.phone_number + '<br/>' : ''}
                ${jobInfo ? 'Gig: ' + jobInfo : ''}
              </p>
              <p>Next step: open the <a href="https://dashboard.checkr.com">Checkr Dashboard</a> → Candidates → Invite candidate, enter their details, and send the invitation. Checkr will email them the secure form. When the result comes back, mark them <strong>Clear</strong> or <strong>Failed</strong> in the Arriv admin → Background Checks page.</p>
              <p style="color:#888;font-size:12px;margin-top:24px">— Arriv Estate Media</p>
            </div>`,
          });
        } catch (e) { console.error('Admin email failed:', e.message); }
      }
      return Response.json({ success: true, manual: true });
    }

    // ---- AUTOMATED MODE (Checkr API key configured) ----
    const fullName = (user.full_name || '').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || 'Media';
    const lastName = nameParts.slice(1).join(' ') || 'Partner';

    const candRes = await fetch(CHECKR_BASE + '/candidates', {
      method: 'POST',
      headers: { 'Authorization': checkrAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email: user.email, copy_requested: true }),
    });
    if (!candRes.ok) {
      const errText = await candRes.text();
      console.error('Checkr candidate creation failed:', candRes.status, errText);
      return Response.json({ error: 'We could not start your background check with our screening partner. Please try again or contact support.' }, { status: 502 });
    }
    const candidate = await candRes.json();

    const pkg = Deno.env.get('CHECKR_PACKAGE') || 'tasker_standard';
    const invRes = await fetch(CHECKR_BASE + '/invitations', {
      method: 'POST',
      headers: { 'Authorization': checkrAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidate.id, package: pkg }),
    });
    if (!invRes.ok) {
      const errText = await invRes.text();
      console.error('Checkr invitation creation failed:', invRes.status, errText);
      return Response.json({ error: 'We could not start your background check with our screening partner. Please try again or contact support.' }, { status: 502 });
    }
    const invitation = await invRes.json();

    await base44.asServiceRole.entities.User.update(user.id, {
      checkr_candidate_id: candidate.id,
      checkr_invitation_id: invitation.id,
      checkr_invitation_url: invitation.invitation_url,
      background_check_status: 'pending',
      background_check_authorized_at: nowIso,
      background_check_pending_job_id: jobId || null,
    });

    if (bookJob && jobId && jobData) {
      await base44.asServiceRole.functions.invoke('bookJobAndSendCalendarInvite', { jobId, jobData, mediaPartnerEmail });
    }
    return Response.json({ success: true, invitation_url: invitation.invitation_url });
  } catch (error) {
    console.error('initiateBackgroundCheck error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});