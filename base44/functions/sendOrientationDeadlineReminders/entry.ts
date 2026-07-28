import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendDeadlineReminders } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const res = await sendDeadlineReminders(base44);
    return Response.json({ success: true, ...res });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});