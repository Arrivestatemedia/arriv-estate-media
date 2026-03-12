import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// One-time cleanup function: retire AI-scheduled tasks superseded by real activities,
// then trigger scheduling for contacts that are missing a follow-up task.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 1000);

    // Group by contact key + sales member
    const grouped = {};
    all.forEach(a => {
      const key = `${a.sales_member_id || a.sales_member_email}::${a.contact_email || a.contact_name}`;
      if (!key || key.startsWith('::')) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });

    const toRetire = [];
    const needsScheduling = []; // contacts with real activity but no future AI task

    const now = new Date();

    Object.values(grouped).forEach(list => {
      const aiItems = list.filter(a => {
        const n = a.notes || '';
        return n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
      });

      const realItems = list.filter(a => {
        const n = a.notes || '';
        return !n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
      });

      // Retire AI tasks superseded by real activity
      aiItems.forEach(ai => {
        const aiDay = new Date(ai.activity_date);
        aiDay.setHours(0, 0, 0, 0);
        const hasRealOnOrAfter = realItems.some(r => new Date(r.activity_date) >= aiDay);
        if (hasRealOnOrAfter) {
          toRetire.push(ai);
        }
      });

      // Find contacts with real activity but no FUTURE AI-scheduled task
      if (realItems.length > 0) {
        const hasFutureAITask = aiItems.some(ai => {
          const d = new Date(ai.activity_date);
          return d > now && !toRetire.includes(ai);
        });

        if (!hasFutureAITask) {
          // Sort real items by date descending, take the most recent
          const sorted = [...realItems].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
          const latest = sorted[0];
          needsScheduling.push(latest);
        }
      }
    });

    // Retire stale tasks
    const retiredDate = new Date();
    retiredDate.setDate(retiredDate.getDate() - 30);

    if (toRetire.length > 0) {
      await Promise.all(toRetire.map(a =>
        base44.asServiceRole.entities.ActivityLog.update(a.id, {
          activity_date: retiredDate.toISOString(),
          notes: `[Queue Call] Retired by cleanup — ${(a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/i, '').slice(0, 80)}`,
        }).catch(() => {})
      ));
    }

    // Trigger scheduling for contacts missing a follow-up
    const scheduled = [];
    for (const activity of needsScheduling) {
      try {
        await base44.asServiceRole.functions.invoke('scheduleFollowUpFromActivity', {
          activity_id: activity.id,
          activity_type: activity.activity_type,
          contact_email: activity.contact_email,
          contact_name: activity.contact_name,
          company_name: activity.company_name,
          notes: activity.notes,
          sales_member_id: activity.sales_member_id,
          sales_member_email: activity.sales_member_email,
          picture_urls: activity.picture_urls || [],
          _force_reschedule: true,
        });
        scheduled.push(activity.contact_name || activity.contact_email);
      } catch (e) {
        console.error('Failed to schedule for', activity.contact_name, e.message);
      }
    }

    return Response.json({
      success: true,
      retired: toRetire.length,
      retired_contacts: toRetire.map(a => a.contact_name || a.contact_email),
      scheduled: scheduled.length,
      scheduled_contacts: scheduled,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});