import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// One-time cleanup function: retire AI-scheduled tasks that have been superseded by real activities
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

    Object.values(grouped).forEach(list => {
      const aiItems = list.filter(a => {
        const n = a.notes || '';
        return (n.includes('[AI Scheduled]') || n.includes('--- CALL MAP ---')) && !n.includes('[Queue Call]');
      });

      const realItems = list.filter(a => {
        const n = a.notes || '';
        return !n.includes('[AI Scheduled]') && !n.includes('--- CALL MAP ---') && !n.includes('[Queue Call]');
      });

      aiItems.forEach(ai => {
        const aiDay = new Date(ai.activity_date);
        aiDay.setHours(0, 0, 0, 0);
        const hasRealOnOrAfter = realItems.some(r => new Date(r.activity_date) >= aiDay);
        if (hasRealOnOrAfter) {
          toRetire.push(ai);
        }
      });
    });

    if (toRetire.length === 0) {
      return Response.json({ success: true, retired: 0, message: 'No stale tasks found' });
    }

    const retiredDate = new Date();
    retiredDate.setDate(retiredDate.getDate() - 30);

    await Promise.all(toRetire.map(a =>
      base44.asServiceRole.entities.ActivityLog.update(a.id, {
        activity_date: retiredDate.toISOString(),
        notes: `[Queue Call] Retired by cleanup — ${(a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/i, '').slice(0, 80)}`,
      }).catch(() => {})
    ));

    return Response.json({
      success: true,
      retired: toRetire.length,
      contacts: toRetire.map(a => a.contact_name || a.contact_email)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});