import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// One-time cleanup: retire stale AI tasks AND schedule follow-ups for contacts missing one
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const all = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 1000);

    // Group by contact key + sales member — only real named contacts, not phone numbers/extensions
    const grouped = {};
    all.forEach(a => {
      const sid = a.sales_member_id || a.sales_member_email || '';
      const cid = a.contact_email || a.contact_name || '';
      if (!sid || !cid) return;
      // Skip phone numbers and short extensions (not real contact names)
      if (/^\+?\d+$/.test(cid) || cid.length <= 5) return;
      const key = `${sid}::${cid}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });

    const toRetire = [];
    const needsScheduling = [];
    const now = new Date();

    Object.values(grouped).forEach(list => {
      const aiItems = list.filter(a => {
        const n = a.notes || '';
        return n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
      });

      const realItems = list.filter(a => {
        const n = a.notes || '';
        return !n.includes('[AI Scheduled]') && !n.includes('[Queue Call]') &&
               ['call', 'email', 'meeting'].includes(a.activity_type);
      });

      // Retire AI tasks superseded by a real activity on or after the AI task date
      aiItems.forEach(ai => {
        const aiDay = new Date(ai.activity_date);
        aiDay.setHours(0, 0, 0, 0);
        const superseded = realItems.some(r => new Date(r.activity_date) >= aiDay);
        if (superseded) toRetire.push(ai);
      });

      // If there are real activities but no future AI-scheduled task, schedule one
      if (realItems.length > 0) {
        const activeFutureAITask = aiItems.find(ai => {
          return new Date(ai.activity_date) > now && !toRetire.find(r => r.id === ai.id);
        });

        if (!activeFutureAITask) {
          const sorted = [...realItems].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
          needsScheduling.push(sorted[0]);
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
          notes: `[Queue Call] Retired by cleanup — ${(a.notes || '').replace(/^\[AI Scheduled\]\s*/i, '').slice(0, 80)}`,
        }).catch(() => {})
      ));
    }

    // Schedule follow-ups via LLM for contacts missing one
    const scheduled = [];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    for (const activity of needsScheduling) {
      try {
        // Build history snippet for this contact+member
        const contactHistory = all.filter(a => {
          const cMatch = (activity.contact_email && a.contact_email === activity.contact_email) ||
                         (activity.contact_name && a.contact_name === activity.contact_name);
          const mMatch = a.sales_member_id === activity.sales_member_id ||
                         (a.sales_member_email || '').toLowerCase() === (activity.sales_member_email || '').toLowerCase();
          const n = a.notes || '';
          return cMatch && mMatch && !n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
        }).sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date)).slice(0, 10);

        const historySnippet = contactHistory
          .map(a => `${new Date(a.activity_date).toLocaleDateString()}: [${a.activity_type}] ${(a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').slice(0, 120)}`)
          .join('\n');

        const latestNotes = (activity.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '');

        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `You are a sales scheduling AI for ARRIV (real estate photography and video company). Schedule the next follow-up AND write a full call map for the rep to use.

TODAY: ${today}
CONTACT: ${activity.contact_name || activity.contact_email} at ${activity.company_name || 'their company'}
LAST ACTIVITY: [${activity.activity_type}] on ${new Date(activity.activity_date).toLocaleDateString()} — ${latestNotes.slice(0, 200)}
PRIOR HISTORY:
${historySnippet || 'No prior history'}

SCHEDULING RULES:
- NEVER schedule same-day or next-day unless notes explicitly say "call back today/tomorrow"
- Default minimum: 7 days from today
- If warm/interested: 7-10 days
- If no answer / left voicemail: 7 days
- If they said "I'll reach out when ready" / "building home" / "not ready yet" / waiting on something: 45-60 days
- If not interested OR already has someone / a photographer / a vendor: 120-180 days (4-6 months) — they may change their mind
- If they said "never" / "remove me" / "do not call": urgency = "skip"
- Use common sense — go as far out as needed. There's no maximum.

CALL MAP RULES:
- Write a tailored call map the rep will use when they actually make this follow-up call
- Reference specific details from the contact's history (what they said, their situation, their company, their market)
- Include: Opening, If Interested, If They Already Have Someone, If Not Ready Yet, If Busy/Bad Time, If Too Expensive, Voicemail Script, Follow-Up Text
- Keep each section 2-3 sentences max, conversational and natural
- Do NOT be generic — make it specific to this contact's situation

Return ONLY valid JSON:
{
  "days_until_followup": <number>,
  "reason": "<brief reason (1 sentence)>",
  "urgency": "high" | "medium" | "low" | "skip",
  "call_map": "<full call map formatted with emoji headers like 📞 Opening, 🔀 If Interested, etc.>"
}`,
          response_json_schema: {
            type: 'object',
            properties: {
              days_until_followup: { type: 'number' },
              reason: { type: 'string' },
              urgency: { type: 'string' },
              call_map: { type: 'string' }
            },
            required: ['days_until_followup', 'reason', 'urgency', 'call_map']
          }
        });

        const scheduleData = typeof llmResult === 'string' ? JSON.parse(llmResult) : llmResult;

        if (scheduleData.urgency === 'skip') continue;

        const daysOut = Math.max(7, Math.round(scheduleData.days_until_followup || 7));
        const followUpDate = new Date();
        followUpDate.setUTCDate(followUpDate.getUTCDate() + daysOut);
        // Use ET timezone: EDT (UTC-4) Mar-Nov, EST (UTC-5) Nov-Mar
        const yr = followUpDate.getUTCFullYear();
        const isDST = followUpDate >= new Date(Date.UTC(yr, 2, 8)) && followUpDate < new Date(Date.UTC(yr, 10, 1));
        const etOffsetHours = isDST ? 4 : 5; // hours to add to ET to get UTC
        // Target 9:30 AM ET
        followUpDate.setUTCHours(9 + etOffsetHours, 30, 0, 0);

        await base44.asServiceRole.entities.ActivityLog.create({
          activity_type: 'call',
          contact_name: activity.contact_name || '',
          contact_email: activity.contact_email || '',
          company_name: activity.company_name || '',
          activity_date: followUpDate.toISOString(),
          notes: `[AI Scheduled] ${scheduleData.reason || 'Follow-up'}${scheduleData.call_map ? '\n\n--- CALL MAP ---\n' + scheduleData.call_map : ''}`,
          sales_member_id: activity.sales_member_id || '',
          sales_member_email: activity.sales_member_email || '',
        });

        scheduled.push(`${activity.contact_name || activity.contact_email} → +${daysOut} days`);
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