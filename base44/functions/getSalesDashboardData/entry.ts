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

    // Run ALL queries in parallel for speed
    const [
      profileRes, activitiesRes, missedCallsRes, smsRes, notifRes,
      contactsRes, secondaryRes, trainingModulesRes, certRes,
      watchProgressRes, attemptsRes, queueInsightsRes, allMembersRes,
    ] = await Promise.allSettled([
      // 1. Profile (non-sensitive fields only — NEVER return password_hash)
      base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id),
      // 2. Activities (sorted by activity_date descending, limit 500)
      base44.asServiceRole.entities.ActivityLog.filter({ sales_member_id }, '-activity_date', 500),
      // 3. Missed calls (unread missed call activities)
      base44.asServiceRole.entities.ActivityLog.filter({
        sales_member_id, activity_type: 'call', missed: true, missed_acknowledged: false,
      }),
      // 4. SMS conversations (for unread badge + dialer messages)
      base44.asServiceRole.entities.SmsConversation.filter({ sales_member_id }),
      // 5. Unread pending notifications (for video call alerts)
      base44.asServiceRole.entities.PendingNotification.filter({
        recipient_id: sales_member_id, is_read: false,
      }),
      // 6. Contacts (for MyContacts, ContactSearch, EmailComposer)
      base44.asServiceRole.entities.Contact.filter({ sales_member_id }, '-updated_date', 500),
      // 7. Secondary contact info (for MyContacts)
      base44.asServiceRole.entities.SecondaryContactInfo.list(),
      // 8. Training modules (for TrainingTab)
      base44.asServiceRole.entities.TrainingModule.filter(
        { active: true, module_type: "sales_training" }, 'order', 50
      ),
      // 9. Sales certification (for TrainingTab)
      base44.asServiceRole.entities.SalesCertification.filter({ sales_member_id }),
      // 10. Video watch progress (for TrainingTab)
      base44.asServiceRole.entities.VideoWatchProgress.filter({ sales_member_id }),
      // 11. Training attempts (for TrainingTab)
      base44.asServiceRole.entities.TrainingAttempt.filter({ sales_member_id }),
      // 12. Queue insights (for DailyCallQueue AI learning)
      base44.asServiceRole.entities.QueueInsight.filter({ sales_member_id }, '-logged_at', 200),
      // 13. All active sales team members (for IphoneDialer transfer panel)
      base44.asServiceRole.entities.SalesTeamMember.filter({ is_active: true }),
    ]);

    // Extract profile (non-sensitive fields only)
    let profile = null;
    if (profileRes.status === 'fulfilled' && profileRes.value) {
      const member = profileRes.value;
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
        is_active: member.is_active,
      };
    }

    return Response.json({
      profile,
      activities: activitiesRes.status === 'fulfilled' ? (activitiesRes.value || []) : [],
      missed_calls: missedCallsRes.status === 'fulfilled' ? (missedCallsRes.value || []) : [],
      sms_conversations: smsRes.status === 'fulfilled' ? (smsRes.value || []) : [],
      pending_notifications: notifRes.status === 'fulfilled' ? (notifRes.value || []) : [],
      contacts: contactsRes.status === 'fulfilled' ? (contactsRes.value || []) : [],
      secondary_contact_info: secondaryRes.status === 'fulfilled' ? (secondaryRes.value || []) : [],
      training_modules: trainingModulesRes.status === 'fulfilled' ? (trainingModulesRes.value || []) : [],
      sales_certification: certRes.status === 'fulfilled' ? (certRes.value?.[0] || null) : null,
      video_watch_progress: watchProgressRes.status === 'fulfilled' ? (watchProgressRes.value || []) : [],
      training_attempts: attemptsRes.status === 'fulfilled' ? (attemptsRes.value || []) : [],
      queue_insights: queueInsightsRes.status === 'fulfilled' ? (queueInsightsRes.value || []) : [],
      all_active_members: allMembersRes.status === 'fulfilled' ? (allMembersRes.value || []) : [],
    });
  } catch (error) {
    console.error('[getSalesDashboardData] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}