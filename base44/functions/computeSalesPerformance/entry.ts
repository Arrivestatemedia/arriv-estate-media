import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeSalesHealthScore, computeRampStage, detectWorkMode, workModeLabel } from '../../shared/salesHealthEngine.ts';
import { loadWorkModeTargets } from '../../shared/salesWorkModeConfig.ts';

function getPeriodRanges(now) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const weekStart = new Date(today);
  const dow = weekStart.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  weekStart.setDate(weekStart.getDate() + diff);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  return {
    daily: { start: today, end: now },
    weekly: { start: weekStart, end: now },
    monthly: { start: monthStart, end: now },
    quarterly: { start: quarterStart, end: now },
    yearly: { start: yearStart, end: now },
    lifetime: { start: new Date(0), end: now },
  };
}

function inRange(dateStr, range) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= range.start && d <= range.end;
}

function computeMetrics(activities, commissions, contacts, range) {
  const pa = activities.filter(a => inRange(a.activity_date, range));
  const pc = commissions.filter(c =>
    inRange(c.eligibility_date, range) || inRange(c.payment_cleared_date, range) || inRange(c.created_timestamp, range) || inRange(c.created_date, range)
  );
  const pco = contacts.filter(c => inRange(c.created_date, range));

  const calls = pa.filter(a => a.activity_type === 'call');
  const emails = pa.filter(a => a.activity_type === 'email');
  const meetings = pa.filter(a => a.activity_type === 'meeting');
  const tasks = pa.filter(a => a.activity_type === 'task');

  const callsCompleted = calls.filter(a => !a.missed).length;
  const meaningfulConversations = calls.filter(a =>
    !a.missed && (a.duration_minutes > 0 || /connected|answered|spoke|conversation|interested|warm|booked|scheduled/i.test(a.notes || ''))
  ).length;
  const talkTime = calls.reduce((s, a) => s + (a.duration_minutes || 0), 0);
  const appointments = meetings.length;
  const followUps = tasks.filter(a => /follow.?up|queue call/i.test(a.notes || '')).length;

  const revenue = pc.reduce((s, c) => s + (c.commissionable_amount || c.amount_collected || 0), 0);
  const commission = pc.reduce((s, c) => s + (c.calculated_commission_amount || 0), 0);
  const dealsClosed = pc.length;

  const newContacts = pco.length;
  const uniqueContacts = new Set(pa.map(a => a.contact_email || a.contact_name).filter(Boolean)).size;

  // Compute call streak (consecutive days with >=1 call, ending today)
  const callDates = new Set(
    calls.map(a => new Date(a.activity_date).toISOString().slice(0, 10))
  );
  let callStreak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (callDates.has(cursor.toISOString().slice(0, 10))) {
    callStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    calls_completed: callsCompleted || 0,
    calls_total: calls.length || 0,
    emails_sent: emails.length || 0,
    texts_sent: 0,
    meaningful_conversations: meaningfulConversations || 0,
    appointments_scheduled: appointments || 0,
    deals_closed: dealsClosed || 0,
    revenue_generated: Math.round((revenue || 0) * 100) / 100,
    commission_earned: Math.round((commission || 0) * 100) / 100,
    talk_time_minutes: talkTime || 0,
    new_contacts_claimed: newContacts || 0,
    follow_ups_completed: followUps || 0,
    meetings_scheduled: appointments || 0,
    quotes_sent: 0,
    deals_won: dealsClosed || 0,
    deals_lost: 0,
    close_rate: 0,
    average_deal_size: dealsClosed > 0 ? Math.round((revenue / dealsClosed) * 100) / 100 : 0,
    call_streak: callStreak || 0,
    pipeline: {
      leads: uniqueContacts || 0,
      conversations: meaningfulConversations || 0,
      appointments: appointments || 0,
      quotes: 0,
      clients: dealsClosed || 0,
      revenue: Math.round((revenue || 0) * 100) / 100,
    },
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { sales_member_id } = body;

    let reps;
    if (sales_member_id) {
      const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: sales_member_id });
      reps = (members || []).filter(m => m.is_active !== false);
    } else {
      const all = await base44.asServiceRole.entities.SalesTeamMember.list();
      reps = (all || []).filter(m => m.is_active !== false);
    }

    if (reps.length === 0) {
      return Response.json({ reps: [], company: {} });
    }

    const ranges = getPeriodRanges(new Date());

    const [allActivities, allCommissions, allContacts, allGoals, allFieldProspects, workModeTargets] = await Promise.all([
      base44.asServiceRole.entities.ActivityLog.list('-activity_date', 500),
      base44.asServiceRole.entities.CommissionSourceRecord.list('-created_date', 200),
      base44.asServiceRole.entities.Contact.list('-created_date', 500),
      base44.asServiceRole.entities.SalesGoal.list(),
      base44.asServiceRole.entities.FieldProspect.list('-date_found', 500),
      loadWorkModeTargets(base44),
    ]);

    const repResults = reps.map(rep => {
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

      const metrics = {};
      for (const [periodName, range] of Object.entries(ranges)) {
        metrics[periodName] = computeMetrics(repActivities, repCommissions, repContacts, range);
      }

      // Field prospecting metrics (weekly)
      const weekRange = ranges.weekly;
      const weekFieldProspects = repFieldProspects.filter(p => {
        if (!p.date_found) return false;
        const d = new Date(p.date_found);
        return d >= weekRange.start && d <= weekRange.end;
      });
      const fieldMetrics = {
        field_visits: weekFieldProspects.length,
        field_new_contacts: weekFieldProspects.filter(p => p.converted_to_crm || p.contact_id).length,
        field_meaningful_conversations: weekFieldProspects.filter(p => p.qualification_status === "QUALIFIED" || p.qualification_status === "PENDING").length,
        field_qualified_prospects: weekFieldProspects.filter(p => p.qualification_status === "QUALIFIED").length,
        field_appointments: 0,
        field_customers: 0,
        field_revenue: 0,
      };

      // Detect today's work mode
      const todayRange = ranges.daily;
      const todayCalls = repActivities.filter(a =>
        a.activity_type === 'call' && !a.missed &&
        a.activity_date && new Date(a.activity_date) >= todayRange.start && new Date(a.activity_date) <= todayRange.end
      ).length;
      const todayFieldVisits = repFieldProspects.filter(p => {
        if (!p.date_found) return false;
        const d = new Date(p.date_found);
        return d >= todayRange.start && d <= todayRange.end && p.is_field_prospecting === true;
      }).length;
      const workMode = detectWorkMode(todayCalls, todayFieldVisits);

      // Ramp stage
      const rampStage = computeRampStage(
        rep.original_hire_date || rep.current_effective_hire_date,
        rep.original_hire_date
      );

      // Deterministic Sales Health Score
      const healthScore = computeSalesHealthScore(
        {
          weekly: metrics.weekly,
          field: fieldMetrics,
          growth: {
            repeat_orders: 0,
            first_orders: metrics.weekly.deals_won || metrics.weekly.deals_closed || 0,
            referrals: 0,
            customer_success_followups: 0,
            cancellations: 0,
            refunds: 0,
          },
        },
        workModeTargets,
        rampStage
      );

      return {
        rep_id: rep.id,
        rep_name: rep.full_name,
        rep_email: rep.email,
        role: rep.role,
        title: rep.title || '',
        market: rep.primary_work_location || '',
        hire_date: rep.original_hire_date || rep.current_effective_hire_date || '',
        employment_status: rep.employment_status || '',
        profile_picture_url: rep.profile_picture_url || '',
        ramp_stage: rampStage,
        work_mode: workMode,
        work_mode_label: workModeLabel(workMode),
        field_metrics: fieldMetrics,
        health_score: healthScore,
        metrics,
      };
    });

    // Company totals
    const companyMetrics = {};
    const periodNames = Object.keys(ranges);
    const numericKeys = [
      'calls_completed', 'calls_total', 'emails_sent', 'texts_sent',
      'meaningful_conversations', 'appointments_scheduled', 'deals_closed',
      'revenue_generated', 'commission_earned', 'talk_time_minutes',
      'new_contacts_claimed', 'follow_ups_completed', 'meetings_scheduled',
      'quotes_sent', 'deals_won', 'deals_lost', 'average_deal_size',
    ];

    for (const pn of periodNames) {
      const sum = {};
      for (const key of numericKeys) {
        sum[key] = repResults.reduce((s, r) => s + (r.metrics[pn]?.[key] || 0), 0);
      }
      sum.close_rate = sum.deals_won + sum.deals_lost > 0
        ? sum.deals_won / (sum.deals_won + sum.deals_lost)
        : 0;
      sum.average_deal_size = sum.deals_closed > 0
        ? sum.revenue_generated / sum.deals_closed
        : 0;
      sum.pipeline = {
        leads: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.leads || 0), 0),
        conversations: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.conversations || 0), 0),
        appointments: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.appointments || 0), 0),
        quotes: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.quotes || 0), 0),
        clients: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.clients || 0), 0),
        revenue: repResults.reduce((s, r) => s + (r.metrics[pn]?.pipeline?.revenue || 0), 0),
      };
      companyMetrics[pn] = sum;
    }

    const activeGoals = (allGoals || []).filter(g => g.is_active);

    return Response.json({ reps: repResults, company: companyMetrics, goals: activeGoals });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}