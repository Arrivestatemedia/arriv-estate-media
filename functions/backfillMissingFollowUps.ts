import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Call windows in ET: [startHour, startMin, endHour, endMin]
const CALL_WINDOWS_ET = [
  [7, 55, 8, 10],
  [10, 15, 10, 38],
  [14, 15, 18, 0],
];

function pickCallSlot(daysOut, contactIdentifier) {
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < contactIdentifier.length; i++) {
    hash1 = (hash1 * 31 + contactIdentifier.charCodeAt(i)) >>> 0;
    hash2 = (hash2 * 37 + contactIdentifier.charCodeAt(contactIdentifier.length - 1 - i)) >>> 0;
  }

  const windowIndex = hash1 % CALL_WINDOWS_ET.length;
  const [startH, startM, endH, endM] = CALL_WINDOWS_ET[windowIndex];
  const windowMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  const offsetMinutes = hash2 % windowMinutes;
  const slotH = startH + Math.floor((startM + offsetMinutes) / 60);
  const slotM = (startM + offsetMinutes) % 60;

  // Spread contacts across days: 0-2 extra days to avoid same-day clumping
  const dayJitter = (hash1 + hash2) % 3;
  const totalDays = daysOut + dayJitter;

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + totalDays);
  const yr = date.getUTCFullYear();
  const isDST = date >= new Date(Date.UTC(yr, 2, 8)) && date < new Date(Date.UTC(yr, 10, 1));
  const etOffset = isDST ? 4 : 5;
  date.setUTCHours(slotH + etOffset, slotM, 0, 0);
  return date;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const allLogs = await base44.asServiceRole.entities.ActivityLog.list('-activity_date', 2000);

  // Find contacts that already have an [AI Scheduled] task
  const scheduledEmails = new Set(
    allLogs
      .filter(a => a.notes && a.notes.startsWith('[AI Scheduled]'))
      .map(a => a.contact_email)
      .filter(Boolean)
  );

  // For each contact NOT yet scheduled, find their most recent real activity
  const contactMap = {};
  for (const log of allLogs) {
    const email = log.contact_email;
    if (!email || scheduledEmails.has(email)) continue;
    const n = log.notes || '';
    if (n.startsWith('[AI Scheduled]') || n.startsWith('[Queue Call]')) continue;
    if (!['call', 'email', 'meeting'].includes(log.activity_type)) continue;
    if (!contactMap[email] || new Date(log.activity_date) > new Date(contactMap[email].activity_date)) {
      contactMap[email] = log;
    }
  }

  const toBackfill = Object.values(contactMap);
  console.log(`[Backfill] ${toBackfill.length} contacts need follow-up scheduling`);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let scheduled = 0;
  let errors = 0;
  const results = [];

  for (const activity of toBackfill) {
    try {
      const contactName = activity.contact_name;
      const contactEmail = activity.contact_email;
      const sid = activity.sales_member_id;
      const sem = activity.sales_member_email;
      const notes = activity.notes || '';

      // Get history for this contact
      const contactLogs = allLogs.filter(a => {
        return (contactEmail && a.contact_email === contactEmail) ||
               (contactName && a.contact_name === contactName);
      });

      const historySnippet = contactLogs
        .filter(a => {
          const n = a.notes || '';
          return !n.includes('[AI Scheduled]') && !n.includes('--- CALL MAP ---');
        })
        .slice(0, 10)
        .map(a => `${new Date(a.activity_date).toLocaleDateString()}: [${a.activity_type}] ${(a.notes || '').slice(0, 120)}`)
        .join('\n');

      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a sales scheduling AI for ARRIV (real estate photography and video company). Schedule the next follow-up AND write a call map.

TODAY: ${today}
CONTACT: ${contactName || contactEmail} at ${activity.company_name || 'their company'}
LAST ACTIVITY: [${activity.activity_type}] on ${new Date(activity.activity_date).toLocaleDateString()} — ${notes}
PRIOR HISTORY:
${historySnippet || 'No prior history'}

SCHEDULING RULES:
- If BRAND NEW contact with NO prior history: 0-1 days (same-day or next-day)
- If no answer / left voicemail on first ever attempt: 1-2 days
- If warm/interested (2nd+ contact): 7-10 days
- If no answer / left voicemail (not first attempt): 7 days
- If "not ready yet" / waiting on something: 45-60 days
- If already has someone / not interested: 120-180 days
- If "never" / "remove me": urgency = "skip"

CALL MAP RULES:
- Write a tailored call map the rep will use for this follow-up call
- Reference specific details from the contact's history
- Include: 📞 Opening, 🔀 If Interested, 📸 If They Already Have Someone, ⏳ If Not Ready Yet, 📅 If Busy/Bad Time, 💰 If Too Expensive, 📬 Voicemail Script, 📱 Follow-Up Text
- Keep each section 2-3 sentences, conversational and specific to this contact

Return ONLY valid JSON:
{
  "days_until_followup": <number>,
  "reason": "<brief reason>",
  "urgency": "high" | "medium" | "low" | "skip",
  "call_map": "<full call map>"
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

      if (scheduleData.urgency === 'skip') {
        results.push({ email: contactEmail, status: 'skipped' });
        continue;
      }

      const daysOut = Math.max(0, Math.round(scheduleData.days_until_followup ?? 1));
      const followUpDate = pickCallSlot(daysOut, contactEmail || contactName || '');

      await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'call',
        contact_name: contactName || '',
        contact_email: contactEmail || '',
        company_name: activity.company_name || '',
        activity_date: followUpDate.toISOString(),
        notes: `[AI Scheduled] ${scheduleData.reason || 'Follow-up'}\n\n--- CALL MAP ---\n${scheduleData.call_map}`,
        sales_member_id: sid || '',
        sales_member_email: sem || '',
      });

      scheduled++;
      results.push({ email: contactEmail, status: 'scheduled', daysOut, followUpDate: followUpDate.toISOString() });
      console.log(`[Backfill] Scheduled follow-up for ${contactEmail} in ${daysOut} days`);
    } catch (e) {
      errors++;
      results.push({ email: activity.contact_email, status: 'error', error: e.message });
      console.error(`[Backfill] Failed for ${activity.contact_email}: ${e.message}`);
    }
  }

  return Response.json({ success: true, scheduled, errors, total: toBackfill.length, results });
});