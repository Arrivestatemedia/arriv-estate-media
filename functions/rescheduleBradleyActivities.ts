import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Bradley's availability windows (in hours, decimal format)
    const windows = [
      { start: 6.5, end: 8.167 },     // 6:30am - 8:10am
      { start: 10.25, end: 10.633 },  // 10:15am - 10:38am
      { start: 14.25, end: 24 }       // 2:15pm - midnight
    ];

    // Fetch all of Bradley's upcoming activities
    const activities = await base44.entities.ActivityLog.filter({
      sales_member_email: 'bradley@arrivestatemedia.com',
      activity_type: 'call'
    }, '-activity_date', 100);

    const now = new Date();
    let rescheduled = 0;

    for (const activity of activities) {
      const actDate = new Date(activity.activity_date);
      if (actDate < now) continue; // Skip past activities

      const hours = actDate.getHours() + actDate.getMinutes() / 60;
      const isInWindow = windows.some(w => hours >= w.start && hours < w.end);

      if (!isInWindow) {
        // Find next available time
        let newDate = new Date(actDate);
        let found = false;

        for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
          newDate = new Date(actDate);
          newDate.setDate(newDate.getDate() + dayOffset);
          newDate.setHours(0, 0, 0, 0);

          for (const window of windows) {
            const testTime = new Date(newDate);
            testTime.setHours(Math.floor(window.start), Math.round((window.start % 1) * 60), 0, 0);

            if (testTime > now) {
              await base44.entities.ActivityLog.update(activity.id, {
                activity_date: testTime.toISOString()
              });
              rescheduled++;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
    }

    return Response.json({
      success: true,
      rescheduled,
      message: `Rescheduled ${rescheduled} activities to Bradley's availability windows`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});