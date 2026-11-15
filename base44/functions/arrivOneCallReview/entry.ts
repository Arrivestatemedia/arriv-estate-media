/**
 * arrivOneCallReview — call analysis, rep review/corrections, management
 * visibility and the voice/AI settings console.
 *
 * Recording is never analysed here directly: a recording only reaches this
 * function after arrivOneRecordingCallback has verified consent and produced a
 * transcript. Dictation and typed notes are analysed as the rep's own account.
 *
 * Metrics deliberately separate attempts from conversations, count unique
 * prospects rather than dials, and label cellphone IVR sessions apart from
 * ordinary prospect calls, so management numbers cannot be inflated.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorizeArrivOne, requireAdmin } from '../../shared/arrivOneAuth.ts';
import { loadVoiceSettings, saveVoiceSettings, estimateCosts, transcriptionAllowed } from '../../shared/arrivOneSettings.ts';
import { analyzeCallText } from '../../shared/arrivOneAnalysis.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);
const dayKey = (iso: string) => (iso ? String(iso).slice(0, 10) : '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'queue';

    // ---------------- admin settings console ----------------
    if (action === 'settings' || action === 'saveSettings') {
      const admin = await requireAdmin(base44);
      if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
      if (action === 'settings') {
        const settings = await loadVoiceSettings(base44);
        return Response.json({ settings, estimates: estimateCosts(settings) });
      }
      const saved = await saveVoiceSettings(base44, body.settings || {}, admin.user?.email || 'admin');
      await base44.asServiceRole.entities.IvrAuditLog.create({
        action: 'arriv_one_voice_settings_saved',
        target_type: 'arriv_one_settings',
        target_key: 'arriv_one_voice_settings',
        summary: `Recording ${saved.recording_enabled ? 'on' : 'off'}, transcription ${saved.transcription_enabled ? 'on' : 'off'}`,
        at: new Date().toISOString(),
      }).catch(() => {});
      return Response.json({ success: true, settings: saved, estimates: estimateCosts(saved) });
    }

    const auth = await authorizeArrivOne(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const actor = auth.actor;
    const settings = await loadVoiceSettings(base44);
    const isAdmin = actor.role === 'admin';

    // ---------------- analyse a note or transcript ----------------
    if (action === 'analyze') {
      const text = String(body.text || body.transcript || '').trim();
      if (!text) return Response.json({ error: 'There is nothing to analyse yet.' }, { status: 400 });
      const source = body.source === 'recording' ? 'recording' : 'rep_dictation';
      if (source === 'recording' && !transcriptionAllowed(settings, body.consent || 'not_asked')) {
        return Response.json(
          { error: 'A recording can only be transcribed after consent has been established and transcription is enabled.' },
          { status: 403 }
        );
      }
      if (settings.ai_summaries_enabled === false) {
        return Response.json({ error: 'AI summaries are turned off by an administrator.' }, { status: 403 });
      }

      const analysis = await analyzeCallText(base44, {
        source,
        text,
        prospect: body.prospect_name || '',
        rep: actor.full_name,
      });

      const record = await base44.asServiceRole.entities.CallAIAnalysis.create({
        attempt_id: body.attempt_id || '',
        call_sid: body.call_sid || '',
        activity_id: body.activity_id || '',
        contact_id: body.contact_id || '',
        prospect_name: body.prospect_name || '',
        rep_id: actor.sales_member_id || actor.id,
        rep_name: actor.full_name,
        source,
        transcript: source === 'recording' ? text : '',
        summary: analysis.summary,
        objections: analysis.objections,
        services_discussed: analysis.services_discussed,
        package_interest: analysis.package_interest,
        requested_info: analysis.requested_info,
        follow_up_commitments: analysis.follow_up_commitments,
        suggested_outcome: analysis.suggested_outcome,
        suggested_next_steps: analysis.suggested_next_steps,
        suggested_lead_status: analysis.suggested_lead_status,
        coaching: settings.coaching_enabled === false ? {} : analysis.coaching,
        speaker_labels_reliable: analysis.speaker_labels_reliable === true,
        status: 'ready',
        created_at: new Date().toISOString(),
      });

      if (body.attempt_id) {
        await base44.asServiceRole.entities.SalesCallAttempt.updateMany(
          { attempt_id: body.attempt_id },
          { $set: { summary_status: 'ready' } }
        ).catch(() => {});
      }

      return Response.json({ success: true, analysis: record, uncertainty: analysis.uncertainty || [] });
    }

    // ---------------- rep review / corrections ----------------
    if (action === 'correct') {
      if (!body.analysis_id) return Response.json({ error: 'analysis_id is required' }, { status: 400 });
      const record = await base44.asServiceRole.entities.CallAIAnalysis.get(body.analysis_id).catch(() => null);
      if (!record) return Response.json({ error: 'That analysis no longer exists.' }, { status: 404 });
      if (!isAdmin && record.rep_id && record.rep_id !== (actor.sales_member_id || actor.id)) {
        return Response.json({ error: 'That analysis belongs to another representative.' }, { status: 403 });
      }

      const corrections = [
        ...(record.corrections || []),
        {
          at: new Date().toISOString(),
          by: actor.email,
          previous_summary: record.summary || '',
          previous_outcome: record.suggested_outcome || '',
          note: body.note || '',
        },
      ];

      const updated = await base44.asServiceRole.entities.CallAIAnalysis.update(record.id, {
        summary: body.summary ?? record.summary,
        suggested_outcome: body.suggested_outcome ?? record.suggested_outcome,
        suggested_next_steps: body.suggested_next_steps || record.suggested_next_steps,
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.email,
        corrections,
      });

      // Correcting the AI summary syncs the rep's own activity note so the two
      // never contradict each other in the call history.
      if (body.summary && record.activity_id) {
        await base44.asServiceRole.entities.ActivityLog.update(record.activity_id, {
          notes: `[Reviewed] ${body.summary}`,
        }).catch(() => {});
      }

      return Response.json({ success: true, analysis: updated });
    }

    if (action === 'acknowledge') {
      if (!body.analysis_id) return Response.json({ error: 'analysis_id is required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.CallAIAnalysis.update(body.analysis_id, {
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.email,
      });
      return Response.json({ success: true, analysis: updated });
    }

    // ---------------- review queue ----------------
    if (action === 'queue') {
      const analyses = listOf(
        await base44.asServiceRole.entities.CallAIAnalysis.filter({}, { sort: '-created_date', limit: 60 }).catch(() => [])
      );
      const mine = isAdmin ? analyses : analyses.filter((a: any) => !a.rep_id || a.rep_id === (actor.sales_member_id || actor.id));
      const tasks = listOf(
        await base44.asServiceRole.entities.ActivityLog.filter(
          { activity_type: 'task' },
          { sort: '-activity_date', limit: 200 }
        ).catch(() => [])
      );
      const now = Date.now();
      const overdue = tasks
        .filter((t: any) => (t.notes || '').includes('[AI Follow-Up]'))
        .filter((t: any) => t.activity_date && Date.parse(t.activity_date) < now)
        .filter((t: any) => isAdmin || t.sales_member_id === (actor.sales_member_id || actor.id))
        .slice(0, 25);

      return Response.json({
        unreviewed: mine.filter((a: any) => !a.reviewed && a.status === 'ready').slice(0, 25),
        recent: mine.slice(0, 15),
        overdue_follow_ups: overdue,
        settings_summary: {
          ai_summaries_enabled: settings.ai_summaries_enabled !== false,
          coaching_enabled: settings.coaching_enabled !== false,
          recording_enabled: settings.recording_enabled === true,
          transcription_enabled: settings.transcription_enabled === true,
        },
      });
    }

    // ---------------- performance metrics ----------------
    if (action === 'metrics') {
      const [attemptRows, sessionRows, analysisRows, dialerLogs] = await Promise.all([
        base44.asServiceRole.entities.SalesCallAttempt.filter({}, { sort: '-started_at', limit: 1000 }).catch(() => []),
        base44.asServiceRole.entities.SalesDialSession.filter({}, { sort: '-started_at', limit: 500 }).catch(() => []),
        base44.asServiceRole.entities.CallAIAnalysis.filter({}, { sort: '-created_date', limit: 500 }).catch(() => []),
        base44.asServiceRole.entities.ActivityLog.filter({ activity_type: 'call' }, { sort: '-activity_date', limit: 800 }).catch(() => []),
      ]);

      const attempts = listOf(attemptRows).filter(
        (a: any) => isAdmin || a.rep_id === (actor.sales_member_id || actor.id)
      );
      const sessions = listOf(sessionRows).filter(
        (s: any) => isAdmin || s.rep_id === (actor.sales_member_id || actor.id)
      );
      const analyses = listOf(analysisRows).filter(
        (a: any) => isAdmin || a.rep_id === (actor.sales_member_id || actor.id)
      );

      const byRep: Record<string, any> = {};
      const byDay: Record<string, any> = {};
      const uniqueProspects = new Set<string>();
      let answered = 0;
      let noAnswer = 0;
      let voicemail = 0;
      let failed = 0;
      let totalSeconds = 0;
      let cellIvr = 0;
      let inApp = 0;

      for (const attempt of attempts) {
        const repKey = attempt.rep_name || attempt.rep_email || attempt.rep_id || 'Unassigned';
        byRep[repKey] = byRep[repKey] || {
          rep: repKey,
          attempts: 0,
          conversations: 0,
          no_answer: 0,
          minutes: 0,
          cell_ivr: 0,
          in_app: 0,
        };
        byRep[repKey].attempts += 1;
        if (attempt.status === 'answered' || attempt.status === 'completed') {
          if (Number(attempt.duration_seconds || 0) > 0 || attempt.status === 'answered') {
            answered += 1;
            byRep[repKey].conversations += 1;
          }
        }
        if (attempt.status === 'no_answer' || attempt.dial_call_status === 'no-answer') {
          noAnswer += 1;
          byRep[repKey].no_answer += 1;
        }
        if (attempt.status === 'busy' || attempt.status === 'failed') failed += 1;
        if (attempt.call_method === 'cell_ivr') cellIvr += 1;
        else inApp += 1;
        byRep[repKey][attempt.call_method === 'cell_ivr' ? 'cell_ivr' : 'in_app'] += 1;
        const seconds = Number(attempt.duration_seconds || 0);
        totalSeconds += seconds;
        byRep[repKey].minutes = Math.round((byRep[repKey].minutes + seconds / 60) * 10) / 10;
        if (attempt.contact_id) uniqueProspects.add(attempt.contact_id);
        else if (attempt.destination) uniqueProspects.add(attempt.destination);

        const key = dayKey(attempt.started_at);
        if (key) {
          byDay[key] = byDay[key] || { day: key, attempts: 0, conversations: 0, minutes: 0 };
          byDay[key].attempts += 1;
          if (attempt.status === 'answered' || Number(attempt.duration_seconds || 0) > 0) byDay[key].conversations += 1;
          byDay[key].minutes = Math.round((byDay[key].minutes + seconds / 60) * 10) / 10;
        }
      }

      // Voicemails and in-app dialer calls come from the existing CRM history so
      // both calling methods land in one report.
      const dialerCalls = listOf(dialerLogs).filter(
        (l: any) => isAdmin || l.sales_member_id === (actor.sales_member_id || actor.id)
      );
      for (const log of dialerCalls) {
        if (/\[Cellphone Dial-Out\]/.test(log.notes || '')) continue; // already counted as an attempt
        if (/voicemail/i.test(log.notes || '')) voicemail += 1;
      }

      const followUps = listOf(
        await base44.asServiceRole.entities.ActivityLog.filter({ activity_type: 'task' }, { limit: 400 }).catch(() => [])
      ).filter((t: any) => (t.notes || '').includes('[AI Follow-Up]'));

      const objections: Record<string, number> = {};
      for (const item of analyses) {
        for (const objection of item.objections || []) {
          const key = String(objection).trim();
          if (key) objections[key] = (objections[key] || 0) + 1;
        }
      }

      return Response.json({
        scope: isAdmin ? 'organization' : 'rep',
        totals: {
          attempts: attempts.length,
          answered_calls: answered,
          meaningful_conversations: answered,
          unique_prospects: uniqueProspects.size,
          no_answer: noAnswer,
          voicemail,
          failed,
          total_minutes: Math.round((totalSeconds / 60) * 10) / 10,
          cell_ivr_attempts: cellIvr,
          in_app_attempts: inApp,
          dial_sessions: sessions.filter((s: any) => s.status !== 'rejected').length,
          sessions_rejected: sessions.filter((s: any) => s.status === 'rejected').length,
          follow_ups_created: followUps.length,
          follow_ups_overdue: followUps.filter((t: any) => t.activity_date && Date.parse(t.activity_date) < Date.now()).length,
          ai_summaries_ready: analyses.filter((a: any) => a.status === 'ready').length,
          ai_summaries_unreviewed: analyses.filter((a: any) => a.status === 'ready' && !a.reviewed).length,
        },
        by_rep: Object.values(byRep).sort((a: any, b: any) => b.attempts - a.attempts),
        by_day: Object.values(byDay).sort((a: any, b: any) => String(a.day).localeCompare(String(b.day))),
        top_objections: Object.entries(objections)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([objection, count]) => ({ objection, count })),
        coaching_available: analyses.filter((a: any) => a.coaching && Object.keys(a.coaching || {}).length).length,
        note:
          'Attempts are dials placed. Conversations are dials that connected. Unique prospects de-duplicate repeat dials. Cellphone IVR sessions are not counted as prospect calls.',
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('arrivOneCallReview failed:', error);
    return Response.json({ error: error?.message || 'The request could not be completed.' }, { status: 500 });
  }
});