import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, sales_member_id, activity_id, data, notification_id, activity,
            sales_member_name, sales_member_email, conversation_id } = body;

    if (!sales_member_id) {
      return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    }

    // Use asServiceRole to bypass RLS — sales reps don't have platform tokens.
    // Every operation is scoped to the given sales_member_id to ensure users
    // can only modify their own data.

    switch (action) {
      case 'create': {
        // Ensure the activity is owned by this sales rep
        const activityData = {
          ...data,
          sales_member_id,
        };
        const created = await base44.asServiceRole.entities.ActivityLog.create(activityData);
        return Response.json({ activity: created });
      }

      case 'create_activity': {
        // MyContacts follow-up logging — activity sub-object + sales_member_email
        const activityData = {
          ...activity,
          sales_member_id,
          sales_member_email: sales_member_email || undefined,
        };
        const created = await base44.asServiceRole.entities.ActivityLog.create(activityData);
        return Response.json({ activity: created });
      }

      case 'create_certification': {
        // SalesTrainingContent — auto-create certification record on first visit
        const created = await base44.asServiceRole.entities.SalesCertification.create({
          sales_member_id,
          sales_member_name: sales_member_name || undefined,
          sales_member_email: sales_member_email || undefined,
          training_status: 'NOT_STARTED',
          calling_authorization: 'CALLING_LOCKED',
          modules_total: 14,
        });
        return Response.json({ certification: created });
      }

      case 'save_video_progress': {
        // VideoPlayer — create or update VideoWatchProgress
        const progressData = { ...data, sales_member_id };
        if (data?.id) {
          const updated = await base44.asServiceRole.entities.VideoWatchProgress.update(data.id, progressData);
          return Response.json({ progress: updated });
        }
        const created = await base44.asServiceRole.entities.VideoWatchProgress.create(progressData);
        return Response.json({ progress: created });
      }

      case 'submit_quiz': {
        // QuizInterface — create TrainingAttempt, update SalesCertification, create AuditEvent
        const { attempt, certification, module, previous_attempts } = data;
        const created = await base44.asServiceRole.entities.TrainingAttempt.create({
          ...attempt,
          sales_member_id,
          sales_member_email: sales_member_email || undefined,
        });
        if (attempt.passed && certification?.id) {
          const completedModules = [...new Set([...(certification.modules_completed || []), module.module_id])];
          const quizScores = [...(previous_attempts || []), created]
            .filter(a => a.passed).map(a => a.score);
          const avgScore = quizScores.length > 0
            ? quizScores.reduce((s, v) => s + v, 0) / quizScores.length : 0;
          const allCritical = [...(previous_attempts || []), created]
            .every(a => a.all_critical_correct);
          await base44.asServiceRole.entities.SalesCertification.update(certification.id, {
            modules_completed: completedModules,
            modules_passed_count: completedModules.length,
            quiz_average_score: Math.round(avgScore * 10) / 10,
            critical_questions_status: allCritical ? 'ALL_CORRECT' : 'HAS_FAILURES',
            training_status: completedModules.length >= 13 ? 'TRAINING_COMPLETE' : 'IN_PROGRESS',
          });
        }
        await base44.asServiceRole.entities.AuditEvent.create({
          event_type: attempt.passed ? 'QUIZ_PASSED' : 'QUIZ_FAILED',
          sales_member_id,
          sales_member_name: sales_member_name || undefined,
          actor_id: sales_member_id,
          actor_name: sales_member_name || undefined,
          actor_role: 'REP',
          entity_type: 'TrainingAttempt',
          entity_id: created.id,
          details: { module_id: module.module_id, score: attempt.score, passed: attempt.passed },
          timestamp: new Date().toISOString(),
        });
        return Response.json({ attempt: created });
      }

      case 'update': {
        if (!activity_id) {
          return Response.json({ error: 'activity_id is required for update' }, { status: 400 });
        }
        // Verify ownership before updating
        const existing = await base44.asServiceRole.entities.ActivityLog.get(activity_id);
        if (!existing) {
          return Response.json({ error: 'Activity not found' }, { status: 404 });
        }
        if (existing.sales_member_id !== sales_member_id) {
          return Response.json({ error: 'Not authorized to modify this activity' }, { status: 403 });
        }
        const updated = await base44.asServiceRole.entities.ActivityLog.update(activity_id, data);
        return Response.json({ activity: updated });
      }

      case 'delete': {
        if (!activity_id) {
          return Response.json({ error: 'activity_id is required for delete' }, { status: 400 });
        }
        // Verify ownership before deleting
        const existing = await base44.asServiceRole.entities.ActivityLog.get(activity_id);
        if (!existing) {
          return Response.json({ error: 'Activity not found' }, { status: 404 });
        }
        if (existing.sales_member_id !== sales_member_id) {
          return Response.json({ error: 'Not authorized to delete this activity' }, { status: 403 });
        }
        await base44.asServiceRole.entities.ActivityLog.delete(activity_id);
        return Response.json({ success: true });
      }

      case 'create_queue_insight': {
        // DailyCallQueue — save AI learning insight
        const insightData = {
          ...data,
          sales_member_id,
          logged_at: data?.logged_at || new Date().toISOString(),
        };
        const created = await base44.asServiceRole.entities.QueueInsight.create(insightData);
        return Response.json({ insight: created });
      }

      case 'get_call_logs': {
        // Recents list in the dialer. Read with the service role because sales
        // reps have no platform token, so a direct ActivityLog read comes back
        // empty; the query is scoped to this rep only.
        const calls = await base44.asServiceRole.entities.ActivityLog.filter(
          { activity_type: 'call', sales_member_id },
          '-activity_date',
          100
        );
        // Only the fields the Recents list renders, so the payload stays small.
        const recent = (calls || []).map((c) => ({
          id: c.id,
          contact_name: c.contact_name,
          company_name: c.company_name,
          contact_email: c.contact_email,
          notes: c.notes,
          activity_date: c.activity_date,
          duration_minutes: c.duration_minutes,
          direction: c.direction
        }));
        return Response.json({ calls: recent });
      }

      case 'get_conversations': {
        // The dialer's Messages tab. Read with the service role and scoped to
        // this rep, so a rep can only ever receive their own threads.
        const convos = await base44.asServiceRole.entities.SmsConversation.filter(
          { sales_member_id },
          '-last_message_at',
          100
        );
        const conversations = (convos || []).map((c) => ({
          id: c.id,
          from_number: c.from_number,
          contact_name: c.contact_name,
          last_message: c.last_message,
          last_message_at: c.last_message_at,
          unread_count: c.unread_count,
          last_reply_at: c.last_reply_at,
          last_link_click_at: c.last_link_click_at
        }));
        return Response.json({ conversations });
      }

      case 'get_conversation_messages': {
        // A thread's messages are only returned to the rep who owns it.
        const owned = await base44.asServiceRole.entities.SmsConversation.filter({ id: conversation_id });
        const convo = (owned || [])[0];
        if (!convo || convo.sales_member_id !== sales_member_id) {
          return Response.json({ messages: [], error: 'not_your_conversation' }, { status: 403 });
        }
        const msgs = await base44.asServiceRole.entities.SmsMessage.filter(
          { conversation_id },
          'created_date',
          500
        );
        const messages = (msgs || []).map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          created_date: m.created_date,
          status: m.status,
          twilio_error_message: m.twilio_error_message,
          link_engagement: m.link_engagement,
          replied_at: m.replied_at,
          from_number: m.from_number,
          to_number: m.to_number
        }));
        return Response.json({ messages });
      }

      case 'get_pending_notifications': {
        // Return unread pending notifications for this user (optionally filtered by event_type)
        const filter = {
          recipient_id: sales_member_id,
          is_read: false,
          ...(body.event_type ? { event_type: body.event_type } : {}),
        };
        const notifications = await base44.asServiceRole.entities.PendingNotification.filter(filter) || [];
        return Response.json({ notifications });
      }

      case 'mark_notification_read': {
        if (!notification_id) {
          return Response.json({ error: 'notification_id is required' }, { status: 400 });
        }
        // Verify ownership before updating
        const existing = await base44.asServiceRole.entities.PendingNotification.get(notification_id);
        if (!existing) {
          return Response.json({ error: 'Notification not found' }, { status: 404 });
        }
        if (existing.recipient_id !== sales_member_id) {
          return Response.json({ error: 'Not authorized to modify this notification' }, { status: 403 });
        }
        const updated = await base44.asServiceRole.entities.PendingNotification.update(notification_id, { is_read: true });
        return Response.json({ notification: updated });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}