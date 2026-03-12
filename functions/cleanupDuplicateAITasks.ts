import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// One-time cleanup: removes duplicate AI-scheduled tasks created by the erroneous automation loop.
// Keeps only the LATEST AI-scheduled task per contact (with a call map), deletes the rest.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 2000);

    // Group AI-scheduled activities by contact_email
    const byContact = {};
    all.forEach(a => {
      const notes = a.notes || '';
      const isAI = notes.includes('[AI Scheduled]') || notes.includes('--- CALL MAP ---');
      if (!isAI) return;
      // Skip queue-logged
      if (notes.includes('[Queue Call]')) return;

      const key = a.contact_email || a.contact_name;
      if (!key) return;
      if (!byContact[key]) byContact[key] = [];
      byContact[key].push(a);
    });

    const toDelete = [];

    Object.entries(byContact).forEach(([key, items]) => {
      if (items.length <= 1) return;

      // Sort: prefer ones with call maps, then by latest created_date
      const sorted = [...items].sort((a, b) => {
        const aHasMap = /--- CALL MAP ---/i.test(a.notes || '');
        const bHasMap = /--- CALL MAP ---/i.test(b.notes || '');
        if (aHasMap && !bHasMap) return -1;
        if (!aHasMap && bHasMap) return 1;
        return new Date(b.created_date) - new Date(a.created_date);
      });

      // Keep the first (best), delete the rest
      const [_keep, ...extras] = sorted;
      extras.forEach(e => toDelete.push(e.id));
    });

    console.log(`[cleanupDuplicateAITasks] Found ${toDelete.length} duplicate AI tasks to delete`);

    let deleted = 0;
    for (const id of toDelete) {
      try {
        await base44.asServiceRole.entities.ActivityLog.delete(id);
        deleted++;
      } catch (e) {
        console.warn(`Failed to delete ${id}:`, e.message);
      }
    }

    return Response.json({ success: true, deleted, total_found: toDelete.length });
  } catch (error) {
    console.error('cleanupDuplicateAITasks error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});