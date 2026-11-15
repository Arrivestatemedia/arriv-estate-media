/**
 * arrivOneAiCommand — the single AI command pipeline for Arriv One.
 *
 * interpret  : speech/text → intent + extracted fields + duplicate candidates
 *              + a concrete list of proposed changes. Writes NOTHING.
 * apply      : writes only the approved changes, once per execution id.
 * transcribe : private audio → text (voice commands).
 * history    : the representative's recent commands.
 *
 * Every write is attributed to the authenticated representative resolution in
 * shared/arrivOneAuth.ts, never to a client-supplied id.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { authorizeArrivOne } from '../../shared/arrivOneAuth.ts';
import {
  interpretCommand,
  matchContacts,
  buildProposedActions,
  applyCommand,
} from '../../shared/arrivOneCommand.ts';
import { loadVoiceSettings } from '../../shared/arrivOneSettings.ts';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'interpret';

    const auth = await authorizeArrivOne(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const actor = auth.actor;

    const settings = await loadVoiceSettings(base44);

    if (action === 'transcribe') {
      if (settings.voice_command_enabled === false) {
        return Response.json({ error: 'Voice commands are turned off by an administrator.' }, { status: 403 });
      }
      if (!body.file_uri) return Response.json({ error: 'file_uri is required' }, { status: 400 });
      const signed: any = await base44.integrations.Core.CreateFileSignedUrl({
        file_uri: body.file_uri,
        expires_in: 900,
      });
      if (!signed?.signed_url) return Response.json({ error: 'Could not read that recording.' }, { status: 400 });
      const text: any = await base44.integrations.Core.TranscribeAudio({ audio_url: signed.signed_url });
      const transcript = String(text || '').trim();
      if (!transcript) {
        return Response.json({ error: 'Nothing was recognised in that recording. Please try again or type the command.' }, { status: 422 });
      }
      return Response.json({ transcript });
    }

    if (action === 'interpret') {
      if (settings.voice_command_enabled === false) {
        return Response.json({ error: 'AI commands are turned off by an administrator.' }, { status: 403 });
      }
      const text = String(body.text || body.transcript || '').trim();
      if (!text) return Response.json({ error: 'Say or type what you would like to do.' }, { status: 400 });

      const context = {
        now_iso: new Date().toISOString(),
        timezone: body.timezone || 'America/New_York',
        rep_name: actor.full_name,
      };

      const interpreted = await interpretCommand(base44, text, context);
      const candidates = await matchContacts(base44, interpreted.extracted);

      let target = null;
      const needsContact = ['update_prospect', 'log_call', 'create_task', 'update_status'].includes(interpreted.intent);
      if (needsContact && candidates.length === 1) target = candidates[0];

      const actions = buildProposedActions(interpreted.intent, interpreted.extracted, candidates, target);
      const warnings = [...interpreted.warnings];

      if (needsContact && candidates.length === 0) {
        warnings.push('No existing CRM contact matched that person. Review the name and number before saving.');
      }
      if (needsContact && candidates.length > 1) {
        warnings.push(`${candidates.length} existing contacts match. Choose the correct person before saving.`);
      }
      if (interpreted.intent === 'unknown') {
        warnings.push('That command could not be understood as a CRM action.');
      }
      if (interpreted.clarifying_question) warnings.push(interpreted.clarifying_question);

      const execution = await base44.asServiceRole.entities.AICommandExecution.create({
        command_text: text,
        transcript: body.source === 'voice' ? text : '',
        source: body.source === 'voice' ? 'voice' : 'text',
        sales_member_id: actor.sales_member_id || actor.id,
        user_email: actor.email,
        user_name: actor.full_name,
        intent: interpreted.intent,
        confidence: interpreted.confidence,
        proposed_actions: actions,
        extracted: interpreted.extracted,
        candidates,
        warnings,
        status: 'draft',
        created_at: new Date().toISOString(),
      });

      return Response.json({
        execution,
        intent: interpreted.intent,
        confidence: interpreted.confidence,
        extracted: interpreted.extracted,
        candidates,
        proposed_actions: actions,
        warnings,
        clarifying_question: interpreted.clarifying_question,
      });
    }

    if (action === 'apply') {
      if (!body.execution_id) return Response.json({ error: 'execution_id is required' }, { status: 400 });
      const execution = await base44.asServiceRole.entities.AICommandExecution.get(body.execution_id).catch(() => null);
      if (!execution) return Response.json({ error: 'That command no longer exists.' }, { status: 404 });

      if (execution.sales_member_id && actor.sales_member_id && execution.sales_member_id !== actor.sales_member_id) {
        return Response.json({ error: 'That command belongs to another representative.' }, { status: 403 });
      }

      if (execution.status === 'applied') {
        return Response.json({ already_applied: true, execution });
      }

      const edits = body.edits || {};
      const multiMatch = (execution.candidates || []).length > 1;
      const needsContact = ['update_prospect', 'log_call', 'create_task', 'update_status'].includes(
        edits.intent || execution.intent
      );
      if (multiMatch && !edits.contact_id && needsContact) {
        return Response.json({ error: 'Choose which contact this refers to before saving.' }, { status: 400 });
      }

      let result: any;
      try {
        result = await applyCommand(base44, execution, edits, {
          id: execution.sales_member_id || actor.sales_member_id,
          email: actor.email,
          full_name: actor.full_name,
        });
      } catch (error: any) {
        await base44.asServiceRole.entities.AICommandExecution.update(execution.id, {
          status: 'failed',
          error: error?.message || 'The change could not be saved.',
        }).catch(() => {});
        return Response.json({ error: error?.message || 'The change could not be saved.' }, { status: 500 });
      }

      const updated = await base44.asServiceRole.entities.AICommandExecution.update(execution.id, {
        status: 'applied',
        result,
        error: '',
        applied_at: new Date().toISOString(),
        applied_by: actor.email,
        ...(edits.extracted ? { extracted: { ...(execution.extracted || {}), ...edits.extracted } } : {}),
      });

      return Response.json({ success: true, result, execution: updated });
    }

    if (action === 'cancel') {
      if (!body.execution_id) return Response.json({ error: 'execution_id is required' }, { status: 400 });
      const execution = await base44.asServiceRole.entities.AICommandExecution.update(body.execution_id, {
        status: 'cancelled',
      });
      return Response.json({ success: true, execution });
    }

    if (action === 'history') {
      const rows = listOf(
        await base44.asServiceRole.entities.AICommandExecution.filter(
          { sales_member_id: actor.sales_member_id || actor.id },
          { sort: '-created_date', limit: 25 }
        ).catch(() => [])
      );
      return Response.json({ executions: rows });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('arrivOneAiCommand failed:', error);
    return Response.json({ error: error?.message || 'The command could not be completed.' }, { status: 500 });
  }
});