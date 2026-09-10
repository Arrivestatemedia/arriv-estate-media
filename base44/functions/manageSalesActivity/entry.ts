import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, sales_member_id, activity_id, data, notification_id } = body;

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