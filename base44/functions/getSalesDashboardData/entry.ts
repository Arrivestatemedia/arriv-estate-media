import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { sales_member_id } = body;

    if (!sales_member_id) {
      return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    }

    // Use asServiceRole to bypass RLS — sales reps don't have platform tokens
    // (their platform password may not match their sales password), so RLS
    // rules that reference {{user.data.sales_member_id}} evaluate to nothing.
    // This function returns only the data owned by the given sales_member_id.

    // 1. Profile (non-sensitive fields only — NEVER return password_hash)
    let profile = null;
    try {
      const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
      if (member) {
        profile = {
          id: member.id,
          full_name: member.full_name,
          email: member.email,
          role: member.role,
          title: member.title,
          phone_number: member.phone_number,
          twilio_phone_number: member.twilio_phone_number,
          extension: member.extension,
          profile_picture_url: member.profile_picture_url,
          chat_status: member.chat_status,
          company_email: member.company_email,
        };
      }
    } catch (e) { /* member not found */ }

    // 2. Activities (sorted by activity_date descending, limit 500)
    let activities = [];
    try {
      activities = await base44.asServiceRole.entities.ActivityLog.filter(
        { sales_member_id },
        '-activity_date',
        500
      ) || [];
    } catch (e) { /* entity error */ }

    // 3. Missed calls (unread missed call activities)
    let missed_calls = [];
    try {
      missed_calls = await base44.asServiceRole.entities.ActivityLog.filter({
        sales_member_id,
        activity_type: 'call',
        missed: true,
        missed_acknowledged: false,
      }) || [];
    } catch (e) { /* entity error */ }

    // 4. SMS conversations (for unread badge)
    let sms_conversations = [];
    try {
      sms_conversations = await base44.asServiceRole.entities.SmsConversation.filter(
        { sales_member_id }
      ) || [];
    } catch (e) { /* entity error */ }

    // 5. Unread pending notifications (for video call alerts)
    let pending_notifications = [];
    try {
      pending_notifications = await base44.asServiceRole.entities.PendingNotification.filter({
        recipient_id: sales_member_id,
        is_read: false,
      }) || [];
    } catch (e) { /* entity error */ }

    return Response.json({
      profile,
      activities,
      missed_calls,
      sms_conversations,
      pending_notifications,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}