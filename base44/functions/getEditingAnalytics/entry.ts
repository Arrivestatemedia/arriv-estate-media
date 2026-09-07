import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeEditingAnalytics } from '../../shared/editingQueueEngine.ts';

/**
 * Returns editing analytics for staffing/capacity decisions.
 * Includes weekly/monthly volume, editing hours, averages, backlog,
 * quality metrics, editor utilization, and capacity indicators.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
    }

    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get('days') || '30', 10);

    const analytics = await computeEditingAnalytics(base44, daysBack);

    return Response.json({ success: true, analytics });
  } catch (error) {
    console.error('getEditingAnalytics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});