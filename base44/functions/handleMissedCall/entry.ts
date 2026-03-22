import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Called by Twilio after an inbound <Dial> completes.
// If DialCallStatus is "no-answer" or "failed" (nobody picked up), log a missed call for each active rep.
Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const dialStatus = params.get('DialCallStatus') || '';
    const from = params.get('From') || '';

    const missedStatuses = ['no-answer', 'busy', 'failed', 'canceled'];
    if (!missedStatuses.includes(dialStatus)) {
      return new Response('OK', { status: 200 });
    }

    const base44 = createClientFromRequest(req);
    const activeMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true });

    for (const member of activeMembers) {
      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'call',
        contact_name: from,
        contact_email: '',
        company_name: '',
        activity_date: new Date().toISOString(),
        notes: `Missed incoming call from ${from}`,
        duration_minutes: 0,
        missed: true,
        missed_acknowledged: false,
        sales_member_id: member.id,
        sales_member_email: member.email,
        hubspot_synced: false
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('handleMissedCall error:', error.message);
    return new Response('Error', { status: 500 });
  }
});