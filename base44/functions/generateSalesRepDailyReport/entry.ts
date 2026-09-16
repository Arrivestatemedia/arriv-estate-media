import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeSalesHealthScore, computeRampStage, detectWorkMode, workModeLabel } from '../../shared/salesHealthEngine.ts';
import { loadWorkModeTargets } from '../../shared/salesWorkModeConfig.ts';

/**
 * generateSalesRepDailyReport
 *
 * On-demand end-of-day summary report for a single sales rep.
 * Called when an admin clicks "Download Report" — generates in that moment
 * with all current data and returns a formatted text/HTML report for download.
 *
 * Input: { sales_member_id, date? (optional, defaults to today) }
 * Output: { report_text, report_html, rep_name, report_date, filename }
 */

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtTime(min: number): string {
  if (!min || min === 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n || 0).toLocaleString();
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id, date } = body;

    if (!sales_member_id) {
      return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    }

    // Load rep
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: sales_member_id });
    const rep = (members || [])[0];
    if (!rep) {
      return Response.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    // Determine the report date range (default: today)
    const now = new Date();
    const reportDate = date ? new Date(date) : new Date(now);
    reportDate.setHours(23, 59, 59, 999);
    const dayStart = new Date(reportDate);
    dayStart.setHours(0, 0, 0, 0);

    // Also compute week-to-date for health score
    const weekStart = new Date(dayStart);
    const dow = weekStart.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    weekStart.setDate(weekStart.getDate() + diff);

    const dayRange = { start: dayStart, end: reportDate };
    const weekRange = { start: weekStart, end: reportDate };

    // Load all data
    const [allActivities, allCommissions, allContacts, allFieldProspects, workModeTargets] = await Promise.all([
      base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500),
      base44.asServiceRole.entities.CommissionSourceRecord.list('-created_date', 200),
      base44.asServiceRole.entities.Contact.list('-created_date', 500),
      base44.asServiceRole.entities.FieldProspect.list('-date_found', 500),
      loadWorkModeTargets(base44),
    ]);

    const repActivities = allActivities.filter(
      a => a.sales_member_id === rep.id || a.sales_member_email === rep.email
    );
    const repCommissions = rep.arriv_employee_id
      ? allCommissions.filter(c => c.arriv_employee_id === rep.arriv_employee_id)
      : [];
    const repContacts = allContacts.filter(c => c.owner_id === rep.id);
    const repFieldProspects = (allFieldProspects || []).filter(
      p => p.sales_member_id === rep.id && p.is_field_prospecting === true
    );

    // ── DAY ACTIVITIES ──────────────────────────────────────────────
    const dayActivities = repActivities.filter(a => {
      if (!a.activity_date) return false;
      const d = new Date(a.activity_date);
      return d >= dayRange.start && d <= dayRange.end;
    });

    const dayCalls = dayActivities.filter(a => a.activity_type === 'call');
    const dayCallsCompleted = dayCalls.filter(a => !a.missed);
    const dayMissedCalls = dayCalls.filter(a => a.missed);
    const dayMeaningful = dayCallsCompleted.filter(a =>
      a.duration_minutes > 0 || /connected|answered|spoke|conversation|interested|warm|booked|scheduled/i.test(a.notes || '')
    );
    const dayTalkTime = dayCalls.reduce((s, a) => s + (a.duration_minutes || 0), 0);
    const dayEmails = dayActivities.filter(a => a.activity_type === 'email');
    const dayMeetings = dayActivities.filter(a => a.activity_type === 'meeting');
    const dayTasks = dayActivities.filter(a => a.activity_type === 'task');
    const dayNotes = dayActivities.filter(a => a.activity_type === 'note');
    const dayFollowUps = dayTasks.filter(a => /follow.?up|queue call/i.test(a.notes || ''));

    // ── DAY COMMISSIONS / DEALS ─────────────────────────────────────
    const dayCommissions = repCommissions.filter(c => {
      const d = new Date(c.eligibility_date || c.payment_cleared_date || c.created_date || c.created_timestamp);
      return d >= dayRange.start && d <= dayRange.end;
    });
    const dayRevenue = dayCommissions.reduce((s, c) => s + (c.commissionable_amount || c.amount_collected || 0), 0);
    const dayCommission = dayCommissions.reduce((s, c) => s + (c.calculated_commission_amount || 0), 0);

    // ── DAY CONTACTS ────────────────────────────────────────────────
    const dayContacts = repContacts.filter(c => {
      if (!c.created_date) return false;
      const d = new Date(c.created_date);
      return d >= dayRange.start && d <= dayRange.end;
    });

    // ── DAY FIELD PROSPECTING ───────────────────────────────────────
    const dayFieldProspects = repFieldProspects.filter(p => {
      if (!p.date_found) return false;
      const d = new Date(p.date_found);
      return d >= dayRange.start && d <= dayRange.end;
    });

    // ── WEEK METRICS (for health score) ─────────────────────────────
    const weekActivities = repActivities.filter(a => {
      if (!a.activity_date) return false;
      const d = new Date(a.activity_date);
      return d >= weekRange.start && d <= weekRange.end;
    });
    const weekCalls = weekActivities.filter(a => a.activity_type === 'call');
    const weekCallsCompleted = weekCalls.filter(a => !a.missed).length;
    const weekMeaningful = weekCalls.filter(a => !a.missed && (a.duration_minutes > 0 || /connected|answered|spoke|conversation|interested|warm|booked|scheduled/i.test(a.notes || ''))).length;
    const weekMeetings = weekActivities.filter(a => a.activity_type === 'meeting').length;
    const weekTasks = weekActivities.filter(a => a.activity_type === 'task');
    const weekFollowUps = weekTasks.filter(a => /follow.?up|queue call/i.test(a.notes || '')).length;
    const weekCommissions = repCommissions.filter(c => {
      const d = new Date(c.eligibility_date || c.payment_cleared_date || c.created_date || c.created_timestamp);
      return d >= weekRange.start && d <= weekRange.end;
    });
    const weekRevenue = weekCommissions.reduce((s, c) => s + (c.commissionable_amount || c.amount_collected || 0), 0);
    const weekDealsClosed = weekCommissions.length;
    const weekContacts = repContacts.filter(c => {
      if (!c.created_date) return false;
      const d = new Date(c.created_date);
      return d >= weekRange.start && d <= weekRange.end;
    }).length;
    const weekUniqueContacts = new Set(weekActivities.map(a => a.contact_email || a.contact_name).filter(Boolean)).size;

    const weekFieldProspects = repFieldProspects.filter(p => {
      if (!p.date_found) return false;
      const d = new Date(p.date_found);
      return d >= weekRange.start && d <= weekRange.end;
    });
    const weekFieldMetrics = {
      field_visits: weekFieldProspects.length,
      field_new_contacts: weekFieldProspects.filter(p => p.converted_to_crm || p.contact_id).length,
      field_meaningful_conversations: weekFieldProspects.filter(p => p.qualification_status === "QUALIFIED" || p.qualification_status === "PENDING").length,
      field_qualified_prospects: weekFieldProspects.filter(p => p.qualification_status === "QUALIFIED").length,
      field_appointments: 0,
      field_customers: 0,
      field_revenue: 0,
    };

    // ── WORK MODE & RAMP ────────────────────────────────────────────
    const workMode = detectWorkMode(dayCallsCompleted.length, dayFieldProspects.length);
    const rampStage = computeRampStage(
      rep.original_hire_date || rep.current_effective_hire_date,
      rep.original_hire_date
    );

    // ── SALES HEALTH SCORE (week-to-date) ───────────────────────────
    const weeklyMetrics = {
      calls_completed: weekCallsCompleted,
      emails_sent: weekActivities.filter(a => a.activity_type === 'email').length,
      texts_sent: 0,
      meaningful_conversations: weekMeaningful,
      appointments_scheduled: weekMeetings,
      meetings_scheduled: weekMeetings,
      follow_ups_completed: weekFollowUps,
      new_contacts_claimed: weekContacts,
      deals_closed: weekDealsClosed,
      deals_won: weekDealsClosed,
      deals_lost: 0,
      revenue_generated: weekRevenue,
      commission_earned: weekCommissions.reduce((s, c) => s + (c.calculated_commission_amount || 0), 0),
      close_rate: 0,
      average_deal_size: weekDealsClosed > 0 ? weekRevenue / weekDealsClosed : 0,
      pipeline: {
        leads: weekUniqueContacts,
        conversations: weekMeaningful,
        appointments: weekMeetings,
        quotes: 0,
        clients: weekDealsClosed,
        revenue: weekRevenue,
      },
    };

    const healthScore = computeSalesHealthScore(
      {
        weekly: weeklyMetrics,
        field: weekFieldMetrics,
        growth: {
          repeat_orders: 0,
          first_orders: weekDealsClosed,
          referrals: 0,
          customer_success_followups: 0,
          cancellations: 0,
          refunds: 0,
        },
      },
      workModeTargets,
      rampStage
    );

    // ── BUILD REPORT ────────────────────────────────────────────────
    const repName = rep.full_name || rep.email;
    const reportDateStr = fmtDate(dayStart);
    const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    // Activity log lines
    const activityLines: string[] = [];
    for (const a of dayActivities.sort((x, y) => new Date(x.activity_date).getTime() - new Date(y.activity_date).getTime())) {
      const time = new Date(a.activity_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const type = a.activity_type.toUpperCase();
      const contact = a.contact_name || a.contact_email || '';
      const duration = a.duration_minutes ? ` (${fmtTime(a.duration_minutes)})` : '';
      const missed = a.missed ? ' [MISSED]' : '';
      const notes = a.notes ? ` — ${a.notes.slice(0, 120)}` : '';
      activityLines.push(`  ${time}  ${type}${duration}${missed}  ${contact}${notes}`);
    }

    // ── TEXT REPORT ─────────────────────────────────────────────────
    const reportText = [
      `═══════════════════════════════════════════════════════════════`,
      `  ARRIV ESTATE MEDIA — END OF DAY ACTIVITY REPORT`,
      `═══════════════════════════════════════════════════════════════`,
      ``,
      `  Sales Rep:   ${repName}`,
      `  Email:       ${rep.email || 'N/A'}`,
      `  Title:        ${rep.title || 'Sales Representative'}`,
      `  Market:       ${rep.primary_work_location || 'N/A'}`,
      `  Report Date:  ${reportDateStr}`,
      `  Generated:    ${generatedAt}`,
      ``,
      `───────────────────────────────────────────────────────────────`,
      `  SALES HEALTH SCORE (Week-to-Date): ${healthScore.total}/100`,
      `───────────────────────────────────────────────────────────────`,
      `  Ramp Stage:    ${healthScore.ramp_stage.replace(/_/g, ' ')}`,
      `  Work Mode:     ${workModeLabel(workMode)}`,
      ``,
      ...healthScore.components.map(c =>
        `  ${c.label.padEnd(28)} ${String(c.score).padStart(3)}/${c.max} pts`
      ),
      ``,
      `  Summary: ${healthScore.summary}`,
      ...(healthScore.coaching_hints.length > 0 ? ['', '  Coaching Notes:'] : []),
      ...healthScore.coaching_hints.map(h => `    • ${h}`),
      ``,
      `───────────────────────────────────────────────────────────────`,
      `  DAILY ACTIVITY SUMMARY`,
      `───────────────────────────────────────────────────────────────`,
      `  Calls Completed:          ${dayCallsCompleted.length}`,
      `  Missed Calls:             ${dayMissedCalls.length}`,
      `  Meaningful Conversations: ${dayMeaningful.length}`,
      `  Talk Time:                ${fmtTime(dayTalkTime)}`,
      `  Emails Sent:              ${dayEmails.length}`,
      `  Meetings:                 ${dayMeetings.length}`,
      `  Follow-ups Completed:     ${dayFollowUps.length}`,
      `  Notes Logged:             ${dayNotes.length}`,
      `  New Contacts Claimed:     ${dayContacts.length}`,
      `  Field Visits:             ${dayFieldProspects.length}`,
      ``,
      `  Deals Closed:            ${dayCommissions.length}`,
      `  Revenue Generated:       ${fmtMoney(dayRevenue)}`,
      `  Commission Earned:       ${fmtMoney(dayCommission)}`,
      ``,
      `───────────────────────────────────────────────────────────────`,
      `  ACTIVITY LOG (${dayActivities.length} entries)`,
      `───────────────────────────────────────────────────────────────`,
      ...(activityLines.length > 0 ? activityLines : ['  (No activity logged for this day)']),
      ``,
      `───────────────────────────────────────────────────────────────`,
      `  WEEK-TO-DATE SUMMARY`,
      `───────────────────────────────────────────────────────────────`,
      `  Calls Completed:    ${weekCallsCompleted}`,
      `  Meaningful Convos:   ${weekMeaningful}`,
      `  Appointments:        ${weekMeetings}`,
      `  Follow-ups:          ${weekFollowUps}`,
      `  New Contacts:        ${weekContacts}`,
      `  Field Visits:        ${weekFieldProspects.length}`,
      `  Deals Closed:        ${weekDealsClosed}`,
      `  Revenue:             ${fmtMoney(weekRevenue)}`,
      ``,
      `═══════════════════════════════════════════════════════════════`,
      `  End of Report`,
      `═══════════════════════════════════════════════════════════════`,
    ].join('\n');

    // ── HTML REPORT (for printable download) ───────────────────────
    const componentRows = healthScore.components.map(c => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${c.label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${c.score} / ${c.max} pts</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${c.detail}</td>
      </tr>`).join('');

    const activityRows = dayActivities.length > 0
      ? dayActivities.sort((x, y) => new Date(x.activity_date).getTime() - new Date(y.activity_date).getTime()).map(a => {
          const time = new Date(a.activity_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;">${time}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;text-transform:uppercase;font-weight:600;">${a.activity_type}${a.missed ? ' (MISSED)' : ''}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;">${a.contact_name || a.contact_email || ''}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;">${a.duration_minutes ? fmtTime(a.duration_minutes) : ''}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;font-size:12px;">${(a.notes || '').slice(0, 150)}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;">No activity logged for this day</td></tr>';

    const coachingHtml = healthScore.coaching_hints.length > 0
      ? `<div style="margin-top:16px;padding:12px;background:#fff8e1;border-radius:8px;">
          <strong>Coaching Notes:</strong>
          <ul style="margin:8px 0 0 16px;">${healthScore.coaching_hints.map(h => `<li>${h}</li>`).join('')}</ul>
        </div>`
      : '';

    const reportHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>End of Day Report — ${repName} — ${reportDateStr}</title>
<style>
  body { font-family: Georgia, serif; color: #1A1A1A; max-width: 800px; margin: 0 auto; padding: 32px; background: #FFFBF5; }
  h1 { font-size: 22px; color: #2a3536; border-bottom: 2px solid #B8956A; padding-bottom: 8px; }
  h2 { font-size: 16px; color: #B8956A; margin-top: 28px; text-transform: uppercase; letter-spacing: 1px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .rep-info { font-size: 14px; line-height: 1.8; }
  .score-badge { background: #1A1A1A; color: #B8956A; padding: 16px 24px; border-radius: 12px; text-align: center; }
  .score-badge .score { font-size: 36px; font-weight: bold; }
  .score-badge .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .metric-card { background: #fff; padding: 12px 16px; border-radius: 8px; border: 1px solid #eee; }
  .metric-card .val { font-size: 24px; font-weight: bold; color: #2a3536; }
  .metric-card .lbl { font-size: 11px; text-transform: uppercase; color: #888; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
  @media print { body { background: white; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>End of Day Activity Report</h1>
      <div class="rep-info">
        <strong>${repName}</strong><br>
        ${rep.title || 'Sales Representative'} | ${rep.primary_work_location || 'N/A'}<br>
        ${rep.email || ''}<br>
        <em>${reportDateStr}</em>
      </div>
    </div>
    <div class="score-badge">
      <div class="score">${healthScore.total}</div>
      <div class="label">Health Score / 100</div>
    </div>
  </div>

  <h2>Sales Health Score — Week to Date</h2>
  <p style="font-size:13px;color:#666;">Ramp Stage: <strong>${healthScore.ramp_stage.replace(/_/g, ' ')}</strong> &nbsp;|&nbsp; Work Mode: <strong>${workModeLabel(workMode)}</strong></p>
  <table>
    <thead>
      <tr style="background:#f9f6f1;">
        <th style="padding:8px 12px;text-align:left;">Component</th>
        <th style="padding:8px 12px;text-align:right;">Score</th>
        <th style="padding:8px 12px;text-align:left;">Detail</th>
      </tr>
    </thead>
    <tbody>${componentRows}</tbody>
  </table>
  <p style="font-size:13px;margin-top:12px;"><strong>Summary:</strong> ${healthScore.summary}</p>
  ${coachingHtml}

  <h2>Daily Activity Summary</h2>
  <div class="metrics-grid">
    <div class="metric-card"><div class="val">${dayCallsCompleted.length}</div><div class="lbl">Calls Completed</div></div>
    <div class="metric-card"><div class="val">${dayMeaningful.length}</div><div class="lbl">Meaningful Conversations</div></div>
    <div class="metric-card"><div class="val">${fmtTime(dayTalkTime)}</div><div class="lbl">Talk Time</div></div>
    <div class="metric-card"><div class="val">${dayEmails.length}</div><div class="lbl">Emails Sent</div></div>
    <div class="metric-card"><div class="val">${dayMeetings.length}</div><div class="lbl">Meetings</div></div>
    <div class="metric-card"><div class="val">${dayFollowUps.length}</div><div class="lbl">Follow-ups</div></div>
    <div class="metric-card"><div class="val">${dayContacts.length}</div><div class="lbl">New Contacts</div></div>
    <div class="metric-card"><div class="val">${dayFieldProspects.length}</div><div class="lbl">Field Visits</div></div>
    <div class="metric-card"><div class="val">${dayCommissions.length}</div><div class="lbl">Deals Closed</div></div>
    <div class="metric-card"><div class="val">${fmtMoney(dayRevenue)}</div><div class="lbl">Revenue</div></div>
  </div>

  <h2>Activity Log</h2>
  <table>
    <thead>
      <tr style="background:#f9f6f1;">
        <th style="padding:6px 12px;text-align:left;">Time</th>
        <th style="padding:6px 12px;text-align:left;">Type</th>
        <th style="padding:6px 12px;text-align:left;">Contact</th>
        <th style="padding:6px 12px;text-align:left;">Duration</th>
        <th style="padding:6px 12px;text-align:left;">Notes</th>
      </tr>
    </thead>
    <tbody>${activityRows}</tbody>
  </table>

  <h2>Week-to-Date Summary</h2>
  <div class="metrics-grid">
    <div class="metric-card"><div class="val">${weekCallsCompleted}</div><div class="lbl">Calls (Week)</div></div>
    <div class="metric-card"><div class="val">${weekMeaningful}</div><div class="lbl">Conversations (Week)</div></div>
    <div class="metric-card"><div class="val">${weekMeetings}</div><div class="lbl">Appointments (Week)</div></div>
    <div class="metric-card"><div class="val">${weekDealsClosed}</div><div class="lbl">Deals (Week)</div></div>
    <div class="metric-card"><div class="val">${fmtMoney(weekRevenue)}</div><div class="lbl">Revenue (Week)</div></div>
    <div class="metric-card"><div class="val">${weekFieldProspects.length}</div><div class="lbl">Field Visits (Week)</div></div>
  </div>

  <div class="footer">
    Generated by Arriv Estate Media — ${generatedAt}<br>
    This report was generated on-demand and reflects all data available at the time of generation.
  </div>
</body>
</html>`;

    const filename = `EOD_Report_${repName.replace(/\s+/g, '_')}_${dayStart.toISOString().slice(0, 10)}.html`;

    return Response.json({
      report_text: reportText,
      report_html: reportHtml,
      rep_name: repName,
      report_date: reportDateStr,
      filename,
      health_score: healthScore,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}