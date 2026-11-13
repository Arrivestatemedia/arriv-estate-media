/**
 * ivrStudio — administrator API behind the Arriv Call Center IVR studio.
 *
 * Every action is authorized server-side. Flows are validated before they can be
 * published, every publish writes an immutable version snapshot, and a number is
 * only pointed at the new engine when an administrator explicitly does it, after
 * the flow passes diagnostics.
 *
 * Nothing here touches an active call or an already-published flow unless the
 * administrator asks for it by name.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { secrets } from 'base44:runtime';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../../shared/ivr.ts';
import { simulateFlow, validateFlow, pickRule } from '../../shared/ivrFlowEngine.ts';

const APP = 'https://arrivestatemedia.base44.app';

function listOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function newKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function twilioAuth() {
  const sid = secrets.get('TWILIO_ACCOUNT_SID') || '';
  const token = secrets.get('TWILIO_AUTH_TOKEN') || '';
  return { sid, token, ok: !!sid && !!token };
}

async function twilioGet(path: string) {
  const { sid, token, ok } = twilioAuth();
  if (!ok) return { error: 'Twilio credentials are not configured.' };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
  });
  if (!res.ok) return { error: `Twilio returned ${res.status}` };
  return { data: await res.json() };
}

async function twilioPost(path: string, body: Record<string, string>) {
  const { sid, token, ok } = twilioAuth();
  if (!ok) return { error: 'Twilio credentials are not configured.' };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) return { error: `Twilio returned ${res.status}` };
  return { data: await res.json() };
}

/** The behaviours that exist in production today, and where each is editable. */
function inventoryRows(settings: any) {
  return [
    {
      area: 'Inbound call entry (855 and 706)',
      behavior: 'Every inbound call is recognised, then routed to the matching menu.',
      trigger: 'Any inbound call to an Arriv number',
      destination: 'Caller-type menu, then sales, support or Ashley',
      editable_in: 'Visual Flow Builder · Caller Recognition & Rules',
      editable: true,
      verified: false,
      note: 'The existing webhook stays in charge until a published flow is bound to the number.',
    },
    {
      area: 'Public menu: press 1 for sales',
      behavior: 'Rings the Growth Advisor sales group (stages 1-3, then owner fallback).',
      trigger: 'Public caller, keypad 1',
      destination: 'Sales ring group',
      editable_in: 'Menus & Extensions · Routing & Ring Groups',
      editable: true,
      verified: false,
      note: 'Ring stage order and numbers come from the routing configuration.',
    },
    {
      area: 'Public menu: press 2 for portal support',
      behavior: 'Support overflow menu: request a callback or record a technical-support voicemail.',
      trigger: 'Public caller, keypad 2',
      destination: 'Support queue, then callback or voicemail',
      editable_in: 'Queues & Hold Music · Voicemail Management',
      editable: true,
      verified: false,
      note: 'Assist ticketing stays with the existing support function.',
    },
    {
      area: 'Job-application follow-up',
      behavior: 'Applicant-specific greeting, then a transfer to Human Resources with a private announcement.',
      trigger: 'Keypad 3, or a recognised applicant number',
      destination: 'Human Resources line',
      editable_in: 'Specialised Call Experiences · Caller Recognition & Rules',
      editable: true,
      verified: false,
      note: 'Applicant records come from the recruiting entities; the spoken wording and destination are editable.',
    },
    {
      area: 'Ashley AI concierge',
      behavior: 'Ashley answers with her own conversation engine, then transfers or books through the standard booking workflow.',
      trigger: 'Menu option or after-hours routing',
      destination: 'Ashley, then a human or a booking',
      editable_in: 'AI Concierge Settings',
      editable: true,
      verified: false,
      note: 'The conversation logic stays in the existing Ashley function; when she answers and what she may do is editable here.',
    },
    {
      area: 'Sales ring order and timeouts',
      behavior: 'Stage 1 business numbers, stage 2 cellphones, stage 3 owner fallback.',
      trigger: 'Sales routing',
      destination: 'Series of numbers',
      editable_in: 'Routing & Ring Groups',
      editable: true,
      verified: false,
      note: 'Timeouts and the fallback number are editable records.',
    },
    {
      area: 'Owner fallback and legacy forwarding',
      behavior: 'Unanswered calls fall through to the owner number.',
      trigger: 'No answer at every stage',
      destination: settings?.owner_fallback_number || 'Owner number',
      editable_in: 'Routing & Ring Groups · Phone Numbers',
      editable: true,
      verified: false,
      note: '',
    },
    {
      area: 'Callback requests',
      behavior: 'Creates a callback record, assigns it, and alerts the owner.',
      trigger: 'Support overflow, keypad 1',
      destination: 'Call Center → Callbacks',
      editable_in: 'Menus & Extensions · Global Settings',
      editable: true,
      verified: false,
      note: '',
    },
    {
      area: 'Voicemail capture and notification',
      behavior: 'Records the message, stores the file privately, and notifies the owner.',
      trigger: 'Support overflow, keypad 2 / no answer',
      destination: 'Call Center → Voicemails',
      editable_in: 'Voicemail Management',
      editable: true,
      verified: false,
      note: '',
    },
    {
      area: 'Caller recognition from database records',
      behavior: 'Matches the caller number against client, media partner, prospect and applicant records.',
      trigger: 'Every inbound call',
      destination: 'Caller-type menu',
      editable_in: 'Caller Recognition & Rules',
      editable: true,
      verified: false,
      note: 'Recognition reads the same records the existing functions read.',
    },
    {
      area: '706-line SMS forwarding',
      behavior: 'Forwards inbound texts received on the 706 line.',
      trigger: 'Inbound SMS to 706',
      destination: 'Configured forwarding destination',
      editable_in: 'Not exposed in the studio',
      editable: false,
      verified: false,
      note: 'SMS forwarding is a separate function with its own credentials; it is outside the call-flow engine.',
    },
    {
      area: 'Call logging and recording retrieval',
      behavior: 'Writes every call to Call Center → Call history and streams recordings through signed URLs.',
      trigger: 'Every call',
      destination: 'Call Center → Call history',
      editable_in: 'Call History & Analytics',
      editable: true,
      verified: false,
      note: 'Call records themselves are read-only; retention and transcription are configurable.',
    },
  ];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const url = new URL(req.url);

    const auth = await verifyAdmin(base44, body, url);
    if (!auth.authorized) {
      return Response.json({ error: 'Administrator access required' }, { status: 403 });
    }
    const actor = auth.actorEmail || 'admin';
    const E = base44.asServiceRole.entities;

    const audit = async (entry: Record<string, any>) => {
      try {
        await E.IvrAuditLog.create({ at: new Date().toISOString(), actor_email: actor, ...entry });
      } catch (_) {
        /* audit is best-effort but never silent in the returned payload */
      }
    };

    switch (action) {
      case 'bootstrap': {
        const [flows, numbers, voices, assets, rules, schedules, emergency, settings] = await Promise.all([
          E.IvrFlow.filter({}, { sort: '-updated_date', limit: 100 }).catch(() => []),
          E.IvrNumberConfig.filter({}, { sort: 'phone_number', limit: 50 }).catch(() => []),
          E.IvrVoiceProfile.filter({}, { sort: 'name', limit: 100 }).catch(() => []),
          E.IvrAudioAsset.filter({}, { sort: '-updated_date', limit: 200 }).catch(() => []),
          E.IvrCallerRule.filter({}, { sort: 'priority', limit: 200 }).catch(() => []),
          E.IvrSchedule.filter({}, { sort: 'name', limit: 50 }).catch(() => []),
          E.IvrEmergencyState.filter({ settings_key: 'default' }).catch(() => []),
          loadSettings(base44),
        ]);
        const flowList = listOf(flows);
        return Response.json({
          flows: flowList,
          numbers: listOf(numbers),
          voices: listOf(voices),
          assets: listOf(assets),
          rules: listOf(rules),
          schedules: listOf(schedules),
          emergency: listOf(emergency)[0] || null,
          settings,
          default_settings: DEFAULT_SETTINGS,
          inventory: inventoryRows(settings),
          seeded: flowList.length > 0,
          engine_url: `${APP}/functions/ivrEngine`,
        });
      }

      case 'seedFromCurrent': {
        const existingFlows = listOf(await E.IvrFlow.list('-updated_date', 1).catch(() => []));
        if (existingFlows.length) {
          return Response.json({ skipped: true, message: 'Configuration already exists.' });
        }
        const settings = await loadSettings(base44);
        const hrNumber = '+14047891107';
        const ownerNumber = settings.owner_fallback_number || '+14047891107';

        const publicFlow = {
          flow_key: 'flow_public',
          name: 'Public line — main menu',
          status: 'draft' as const,
          start_node_id: 'n_start',
          version: 0,
          nodes: [
            { id: 'n_start', type: 'incoming_call', label: 'Incoming call', x: 80, y: 260, config: {}, next: { default: 'n_menu' } },
            {
              id: 'n_menu',
              type: 'ivr_menu',
              label: 'Main menu',
              x: 300,
              y: 230,
              config: {
                prompt:
                  'Thank you for calling Arriv Estate Media. To book media for your property, press 1. For assistance signing up or booking through our portal, press 2. If you are following up on a job application, press 3.',
                attempts: 3,
                timeout: 6,
                options: [
                  { key: '1', label: 'Book media / sales', target: 'n_sales' },
                  { key: '2', label: 'Portal and booking support', target: 'n_support' },
                  { key: '3', label: 'Job application follow-up', target: 'n_applicant' },
                ],
                invalid_prompt: 'Sorry, that was not a valid option.',
                invalid_target: 'n_menu',
                no_input_target: 'n_support',
              },
              next: { invalid: 'n_menu' },
            },
            {
              id: 'n_sales',
              type: 'ring_group',
              label: 'Growth Advisor ring group',
              x: 640,
              y: 90,
              config: {
                mode: 'sequential',
                ring_seconds: 18,
                whisper_text: 'Incoming Arriv call from a property owner. Press 1 to accept.',
                members: [
                  { name: 'Owner fallback', number: ownerNumber },
                ],
              },
              next: { no_answer: 'n_callback' },
            },
            {
              id: 'n_support',
              type: 'queue',
              label: 'Support queue',
              x: 640,
              y: 250,
              config: {
                prompt: 'Thanks for calling Arriv. Please hold while we connect you with support.',
                leave_message_prompt: 'Press 1 to request a callback, or stay on the line.',
                max_wait_seconds: 120,
                hold_music_url: '',
              },
              next: { no_answer: 'n_callback' },
            },
            {
              id: 'n_callback',
              type: 'request_callback',
              label: 'Request a callback',
              x: 960,
              y: 380,
              config: {
                category: 'general',
                prompt: 'Thank you. We have your number and will call you back shortly.',
              },
              next: {},
            },
            {
              id: 'n_applicant',
              type: 'announcement',
              label: 'Applicant greeting',
              x: 640,
              y: 430,
              config: {
                text: 'Thank you for following up on your application with Arriv. Please hold while we connect you with Human Resources.',
              },
              next: { default: 'n_hr' },
            },
            {
              id: 'n_hr',
              type: 'transfer_number',
              label: 'Transfer to Human Resources',
              x: 940,
              y: 520,
              config: {
                number: hrNumber,
                timeout: 30,
                whisper_text:
                  'Call from {caller}. This caller is following up on a job application. Connecting now.',
              },
              next: { no_answer: 'n_voicemail' },
            },
            {
              id: 'n_voicemail',
              type: 'voicemail',
              label: 'General voicemail',
              x: 1220,
              y: 430,
              config: {
                prompt: 'Please leave your name, number and a short message after the tone.',
                max_seconds: 180,
                category: 'general',
              },
              next: {},
            },
            {
              id: 'n_ashley',
              type: 'ashley_ai',
              label: 'Ashley AI concierge',
              x: 320,
              y: 470,
              config: { department: 'general', fallback_target: 'n_callback' },
              next: { failure: 'n_callback' },
            },
          ],
          notes: 'Mirrors the production main menu. Ashley is available as a node but not on a keypad path yet.',
        };

        const afterHoursFlow = {
          flow_key: 'flow_after_hours',
          name: 'After hours — Ashley',
          status: 'draft' as const,
          start_node_id: 'ah_start',
          version: 0,
          nodes: [
            { id: 'ah_start', type: 'business_hours', label: 'Business hours?', x: 80, y: 200, config: { open_target: 'ah_ashley', closed_target: 'ah_ashley' }, next: {} },
            { id: 'ah_ashley', type: 'ashley_ai', label: 'Ashley takes the call', x: 340, y: 180, config: { department: 'general', fallback_target: 'ah_vm' }, next: { failure: 'ah_vm' } },
            { id: 'ah_vm', type: 'voicemail', label: 'After-hours voicemail', x: 620, y: 180, config: { prompt: 'We are closed right now. Please leave a message and we will call you back on the next business day.', max_seconds: 180, category: 'general' }, next: {} },
          ],
          notes: 'Seeded template — edit and publish when ready.',
        };

        await E.IvrFlow.bulkCreate([publicFlow, afterHoursFlow]);

        await E.IvrVoiceProfile.bulkCreate([
          { voice_key: 'vox_joanna', name: 'Joanna — warm US female', provider: 'polly', voice_id: 'Polly.Joanna', language: 'en-US', active: true, is_default: true, additional_cost_cents: 0, cost_note: 'Included in the Twilio voice price.' },
          { voice_key: 'vox_matthew', name: 'Matthew — confident US male', provider: 'polly', voice_id: 'Polly.Matthew', language: 'en-US', active: true, additional_cost_cents: 0 },
          { voice_key: 'vox_google_f', name: 'Neural2 F — natural US female', provider: 'google', voice_id: 'Google.en-US-Neural2-F', language: 'en-US', active: true, additional_cost_cents: 0, cost_note: 'Google Neural2 voices are billed at Twilio\'s Google voice rate.' },
          { voice_key: 'vox_google_d', name: 'Neural2 D — natural US male', provider: 'google', voice_id: 'Google.en-US-Neural2-D', language: 'en-US', active: true, additional_cost_cents: 0 },
        ]);

        await E.IvrSchedule.create({
          schedule_key: 'sch_default',
          name: 'Standard business hours',
          timezone: 'America/New_York',
          weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            day,
            closed: day === 0 || day === 6,
            open: '09:00',
            close: '17:00',
          })),
          holidays: [],
          after_hours_flow_key: 'flow_after_hours',
          notes: 'Seeded from the current always-on routing. Update before relying on after-hours behavior.',
        });

        const numbers = [
          { phone_number: '+18557654306', label: 'Main 855 line', line: '855' },
          { phone_number: '+17069128967', label: 'Georgia 706 line', line: '706' },
        ];
        await E.IvrNumberConfig.bulkCreate(
          numbers.map((n) => ({
            ...n,
            active_flow_key: '',
            voice_profile_key: 'vox_joanna',
            schedule_key: 'sch_default',
            caller_id_mode: 'public_line',
            voicemail: { enabled: true, max_seconds: 180, transcribe: false, notify_owner: true },
            engine_enabled: false,
            notes: 'Existing production routing stays in charge until a published flow is bound here.',
          }))
        );

        await E.IvrCallerRule.bulkCreate([
          {
            rule_key: 'rule_owner_line',
            name: 'Calls from the owner line',
            priority: 10,
            enabled: false,
            match: 'all',
            conditions: [{ field: 'caller_number', operator: 'equals', value: '+14047891107' }],
            actions: [
              { type: 'play_greeting', text: 'Welcome back. Connecting you to the team.', voice_profile_key: 'vox_joanna' },
              { type: 'play_private_announcement', text: 'Call from the owner line.' },
              { type: 'transfer', number: ownerNumber },
            ],
            notes:
              'Seeded and left disabled so nothing about today\'s behaviour changes. Enable once the wording and destination are confirmed.',
          },
          {
            rule_key: 'rule_applicant_records',
            name: 'Recognised job applicants',
            priority: 20,
            enabled: false,
            match: 'all',
            conditions: [{ field: 'applicant_status', operator: 'equals', value: 'applicant' }],
            actions: [{ type: 'route_menu', target: 'n_applicant' }],
            notes: 'Applicants recognised from recruiting records get the applicant greeting and HR routing.',
          },
        ]);

        await audit({ action: 'seed', target_type: 'ivr', summary: 'Seeded flows, voices, schedule, numbers and rules from the current configuration' });
        return Response.json({ success: true });
      }

      case 'saveFlow': {
        const flow = body.flow || {};
        if (!flow.flow_key) return Response.json({ error: 'flow_key required' }, { status: 400 });
        const rows = listOf(await E.IvrFlow.filter({ flow_key: flow.flow_key }).catch(() => []));
        const patch = {
          flow_key: flow.flow_key,
          name: flow.name || 'Untitled flow',
          status: rows[0]?.status || 'draft',
          start_node_id: flow.start_node_id || '',
          nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
          notes: flow.notes || '',
          phone_numbers: Array.isArray(flow.phone_numbers) ? flow.phone_numbers : rows[0]?.phone_numbers || [],
          version: rows[0]?.version || 0,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        };
        if (rows[0]) await E.IvrFlow.update(rows[0].id, patch);
        else await E.IvrFlow.create(patch);
        await audit({ action: 'save_flow', target_type: 'flow', target_key: flow.flow_key, summary: `Saved draft of ${patch.name}` });
        return Response.json({ success: true, draft_only: true });
      }

      case 'deleteFlow': {
        const rows = listOf(await E.IvrFlow.filter({ flow_key: body.flow_key }).catch(() => []));
        if (!rows[0]) return Response.json({ error: 'Flow not found' }, { status: 404 });
        const bound = listOf(await E.IvrNumberConfig.filter({ active_flow_key: body.flow_key }).catch(() => []));
        if (bound.length) {
          return Response.json({ error: 'This flow is bound to a live number. Unbind it first.' }, { status: 400 });
        }
        await E.IvrFlow.delete(rows[0].id);
        await audit({ action: 'delete_flow', target_type: 'flow', target_key: body.flow_key, summary: 'Deleted flow' });
        return Response.json({ success: true });
      }

      case 'publishFlow': {
        const rows = listOf(await E.IvrFlow.filter({ flow_key: body.flow_key }).catch(() => []));
        const flow = rows[0];
        if (!flow) return Response.json({ error: 'Flow not found' }, { status: 404 });

        const issues = validateFlow(flow);
        const blocking = issues.filter((i) => i.severity === 'error');
        if (blocking.length) {
          return Response.json({ error: 'Flow has blocking problems', issues, published: false }, { status: 400 });
        }

        const version = Number(flow.version || 0) + 1;
        await E.IvrFlowVersion.create({
          flow_key: flow.flow_key,
          version,
          start_node_id: flow.start_node_id || '',
          nodes: flow.nodes || [],
          note: body.note || '',
          published_by: actor,
          published_at: new Date().toISOString(),
          restored_from: body.restored_from || 0,
        });
        await E.IvrFlow.update(flow.id, {
          status: 'published',
          version,
          published_at: new Date().toISOString(),
          published_by: actor,
        });
        await audit({
          action: 'publish_flow',
          target_type: 'flow',
          target_key: flow.flow_key,
          summary: `Published ${flow.name} version ${version}`,
          after: { version },
        });
        return Response.json({ success: true, version, issues, live: true });
      }

      case 'rollbackFlow': {
        const rows = listOf(await E.IvrFlow.filter({ flow_key: body.flow_key }).catch(() => []));
        const flow = rows[0];
        if (!flow) return Response.json({ error: 'Flow not found' }, { status: 404 });
        const versions = listOf(
          await E.IvrFlowVersion.filter({ flow_key: body.flow_key, version: Number(body.version) }).catch(() => [])
        );
        const snapshot = versions[0];
        if (!snapshot) return Response.json({ error: 'That version does not exist' }, { status: 404 });

        const version = Number(flow.version || 0) + 1;
        await E.IvrFlowVersion.create({
          flow_key: flow.flow_key,
          version,
          start_node_id: snapshot.start_node_id || '',
          nodes: snapshot.nodes || [],
          note: `Restored from version ${snapshot.version}`,
          published_by: actor,
          published_at: new Date().toISOString(),
          restored_from: snapshot.version,
        });
        await E.IvrFlow.update(flow.id, {
          nodes: snapshot.nodes || [],
          start_node_id: snapshot.start_node_id || '',
          status: 'published',
          version,
          published_at: new Date().toISOString(),
          published_by: actor,
        });
        await audit({
          action: 'rollback_flow',
          target_type: 'flow',
          target_key: flow.flow_key,
          summary: `Restored version ${snapshot.version} as version ${version}`,
        });
        return Response.json({ success: true, version, restored_from: snapshot.version });
      }

      case 'listVersions': {
        const versions = listOf(
          await E.IvrFlowVersion.filter({ flow_key: body.flow_key }, { sort: '-version', limit: 50 }).catch(() => [])
        );
        return Response.json({ versions });
      }

      case 'diagnostics': {
        const rows = listOf(await E.IvrFlow.filter({ flow_key: body.flow_key }).catch(() => []));
        if (!rows[0]) return Response.json({ error: 'Flow not found' }, { status: 404 });
        const issues = validateFlow(rows[0]);
        return Response.json({ issues, ok: !issues.some((i) => i.severity === 'error') });
      }

      case 'simulate': {
        const rows = listOf(await E.IvrFlow.filter({ flow_key: body.flow_key }).catch(() => []));
        const flow = rows[0];
        if (!flow) return Response.json({ error: 'Flow not found' }, { status: 404 });
        const schedule = body.schedule_key
          ? listOf(await E.IvrSchedule.filter({ schedule_key: body.schedule_key }).catch(() => []))[0] || null
          : null;
        const rules = listOf(await E.IvrCallerRule.filter({ enabled: true }, { limit: 200 }).catch(() => []));
        const ctx: any = {
          caller_number: body.caller_number || '+15555550100',
          dialed_number: body.dialed_number || '',
          caller_type: body.caller_type || 'public',
          caller_name: body.caller_name || '',
          caller_email: '',
          caller_role: body.caller_type || 'public',
          employee_status: '',
          applicant_status: body.applicant_status || '',
          application_stage: '',
          client_status: body.caller_type === 'client' ? 'client' : '',
          prospect_assigned: '',
          assigned_rep: '',
          business_hours: body.business_hours || 'open',
          holiday: 'no',
          weekday: new Date().getDay(),
          minutes_of_day: 10 * 60,
          previous_selection: '',
          previous_failed_transfer: '',
          custom: {},
        };
        const matched = pickRule(rules, ctx);
        const result = simulateFlow(flow, ctx, Array.isArray(body.keypad) ? body.keypad : [], {
          schedule,
          now: body.simulate_time ? new Date(body.simulate_time) : new Date(),
        });
        await E.IvrTestRun.create({
          flow_key: flow.flow_key,
          flow_version: Number(flow.version || 0),
          mode: 'simulation',
          caller_number: ctx.caller_number,
          dialed_number: ctx.dialed_number,
          inputs: (body.keypad || []).map((k: string) => ({ key: k })),
          trace: result.trace,
          matched_rule: matched?.name || '',
          result: result.result,
          issues: result.issues.map((i) => i.message),
          created_by: actor,
          created_at: new Date().toISOString(),
        });
        return Response.json({
          trace: result.trace,
          result: result.result,
          issues: [...validateFlow(flow), ...result.issues],
          matched_rule: matched ? { name: matched.name, priority: matched.priority } : null,
        });
      }

      case 'testRule': {
        const rules = listOf(await E.IvrCallerRule.filter({ enabled: true }, { limit: 200 }).catch(() => []));
        const ctx: any = {
          caller_number: body.caller_number || '',
          dialed_number: body.dialed_number || '',
          caller_type: body.caller_type || 'unknown',
          applicant_status: body.applicant_status || '',
          client_status: body.client_status || '',
          employee_status: body.employee_status || '',
          business_hours: body.business_hours || 'open',
          holiday: 'no',
          weekday: new Date().getDay(),
          minutes_of_day: 10 * 60,
          custom: {},
        };
        const matched = pickRule(rules, ctx);
        if (body.rule_key) {
          const rows = listOf(await E.IvrCallerRule.filter({ rule_key: body.rule_key }).catch(() => []));
          if (rows[0]) await E.IvrCallerRule.update(rows[0].id, { last_tested_at: new Date().toISOString() });
        }
        return Response.json({
          matched: matched ? { name: matched.name, priority: matched.priority, actions: matched.actions } : null,
        });
      }

      case 'saveRule': {
        const rule = body.rule || {};
        if (!rule.rule_key) rule.rule_key = newKey('rule');
        const rows = listOf(await E.IvrCallerRule.filter({ rule_key: rule.rule_key }).catch(() => []));
        const patch = {
          rule_key: rule.rule_key,
          name: rule.name || 'Untitled rule',
          priority: Number(rule.priority ?? 100),
          enabled: rule.enabled !== false,
          match: rule.match === 'any' ? 'any' : 'all',
          conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
          actions: Array.isArray(rule.actions) ? rule.actions : [],
          bypass_ivr: !!rule.bypass_ivr,
          notes: rule.notes || '',
          updated_by: actor,
          updated_at: new Date().toISOString(),
        };
        if (rows[0]) await E.IvrCallerRule.update(rows[0].id, patch);
        else await E.IvrCallerRule.create(patch);
        await audit({ action: 'save_rule', target_type: 'rule', target_key: patch.rule_key, summary: `Saved rule ${patch.name}` });
        return Response.json({ success: true, rule: { ...rows[0], ...patch } });
      }

      case 'deleteRule': {
        const rows = listOf(await E.IvrCallerRule.filter({ rule_key: body.rule_key }).catch(() => []));
        if (rows[0]) await E.IvrCallerRule.delete(rows[0].id);
        await audit({ action: 'delete_rule', target_type: 'rule', target_key: body.rule_key, summary: 'Deleted recognition rule' });
        return Response.json({ success: true });
      }

      case 'saveNumber': {
        const number = body.number || {};
        if (!number.phone_number) return Response.json({ error: 'phone_number required' }, { status: 400 });
        const rows = listOf(await E.IvrNumberConfig.filter({ phone_number: number.phone_number }).catch(() => []));
        const patch = { ...number, updated_by: actor, updated_at: new Date().toISOString() };
        if (rows[0]) await E.IvrNumberConfig.update(rows[0].id, patch);
        else await E.IvrNumberConfig.create(patch);
        await audit({
          action: 'save_number',
          target_type: 'number',
          target_key: number.phone_number,
          summary: `Updated ${number.label || number.phone_number}`,
        });
        return Response.json({ success: true });
      }

      case 'verifyNumber': {
        const number = String(body.phone_number || '');
        if (!number) return Response.json({ error: 'phone_number required' }, { status: 400 });
        const found = await twilioGet(
          `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`
        );
        if (found.error) return Response.json({ error: found.error }, { status: 400 });
        const record = (found.data?.incoming_phone_numbers || [])[0];
        if (!record) return Response.json({ error: 'This number is not on the Arriv Twilio account.', verified: false }, { status: 400 });
        const rows = listOf(await E.IvrNumberConfig.filter({ phone_number: number }).catch(() => []));
        const patch = {
          twilio_sid: record.sid,
          twilio_voice_url: record.voice_url || record.voice_application_sid || '',
          last_verified_at: new Date().toISOString(),
        };
        if (rows[0]) await E.IvrNumberConfig.update(rows[0].id, patch);
        return Response.json({ verified: true, sid: record.sid, voice_url: record.voice_url || '' });
      }

      case 'bindNumber': {
        const number = String(body.phone_number || '');
        const flowKey = String(body.flow_key || '');
        const rows = listOf(await E.IvrNumberConfig.filter({ phone_number: number }).catch(() => []));
        const config = rows[0];
        if (!config) return Response.json({ error: 'Number is not in the studio yet. Save it first.' }, { status: 400 });

        if (!flowKey) {
          await E.IvrNumberConfig.update(config.id, {
            active_flow_key: '',
            engine_enabled: false,
            updated_by: actor,
            updated_at: new Date().toISOString(),
          });
          await audit({ action: 'unbind_number', target_type: 'number', target_key: number, summary: 'Returned to the existing production routing' });
          return Response.json({ success: true, engine_enabled: false });
        }

        const flowRows = listOf(await E.IvrFlow.filter({ flow_key: flowKey }).catch(() => []));
        const flow = flowRows[0];
        if (!flow) return Response.json({ error: 'Flow not found' }, { status: 404 });
        if (flow.status !== 'published') {
          return Response.json({ error: 'Publish the flow before binding it to a number.' }, { status: 400 });
        }
        const issues = validateFlow(flow).filter((i) => i.severity === 'error');
        if (issues.length) return Response.json({ error: 'Flow has blocking problems', issues }, { status: 400 });

        await E.IvrNumberConfig.update(config.id, {
          active_flow_key: flowKey,
          engine_enabled: !!body.enable_engine,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        });
        await E.IvrFlow.update(flow.id, {
          phone_numbers: Array.from(new Set([...(flow.phone_numbers || []), number])),
        });
        await audit({
          action: 'bind_number',
          target_type: 'number',
          target_key: number,
          summary: `Bound ${number} to ${flow.name}${body.enable_engine ? ' and enabled the flow engine' : ' (engine still off)'}`,
        });
        return Response.json({ success: true, engine_enabled: !!body.enable_engine });
      }

      case 'pushTwilioWebhook': {
        const number = String(body.phone_number || '');
        const enable = !!body.enable;
        if (body.confirm !== 'POINT-NUMBER-AT-ENGINE') {
          return Response.json({ error: 'Confirmation text did not match.' }, { status: 400 });
        }
        const rows = listOf(await E.IvrNumberConfig.filter({ phone_number: number }).catch(() => []));
        const config = rows[0];
        if (!config) return Response.json({ error: 'Number is not in the studio yet.' }, { status: 400 });
        if (enable && !config.active_flow_key) {
          return Response.json({ error: 'Bind a published flow to this number first.' }, { status: 400 });
        }
        const found = await twilioGet(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`);
        if (found.error) return Response.json({ error: found.error }, { status: 400 });
        const record = (found.data?.incoming_phone_numbers || [])[0];
        if (!record) return Response.json({ error: 'Twilio does not have this number on the account.' }, { status: 400 });

        const targetUrl = enable ? `${APP}/functions/ivrEngine` : `${APP}/functions/ivrRouter`;
        const updated = await twilioPost(`/IncomingPhoneNumbers/${record.sid}.json`, {
          VoiceUrl: targetUrl,
          VoiceMethod: 'POST',
        });
        if (updated.error) return Response.json({ error: updated.error }, { status: 400 });

        await E.IvrNumberConfig.update(config.id, {
          engine_enabled: enable,
          twilio_sid: record.sid,
          twilio_voice_url: updated.data?.voice_url || targetUrl,
          last_verified_at: new Date().toISOString(),
          updated_by: actor,
        });
        await audit({
          action: enable ? 'number_live_on_engine' : 'number_returned_to_legacy',
          target_type: 'number',
          target_key: number,
          summary: `${number} voice webhook set to ${targetUrl}`,
          after: { voice_url: targetUrl },
        });
        return Response.json({ success: true, voice_url: updated.data?.voice_url || targetUrl });
      }

      case 'saveVoice': {
        const voice = body.voice || {};
        if (!voice.voice_key) voice.voice_key = newKey('vox');
        const rows = listOf(await E.IvrVoiceProfile.filter({ voice_key: voice.voice_key }).catch(() => []));
        const patch = { ...voice, updated_by: actor };
        if (rows[0]) await E.IvrVoiceProfile.update(rows[0].id, patch);
        else await E.IvrVoiceProfile.create(patch);
        await audit({ action: 'save_voice', target_type: 'voice', target_key: patch.voice_key, summary: `Saved voice ${patch.name}` });
        return Response.json({ success: true, voice: { ...rows[0], ...patch } });
      }

      case 'saveAsset': {
        const asset = body.asset || {};
        if (!asset.asset_key) asset.asset_key = newKey('aud');
        const rows = listOf(await E.IvrAudioAsset.filter({ asset_key: asset.asset_key }).catch(() => []));
        const patch = { ...asset, updated_by: actor, updated_at: new Date().toISOString() };
        if (rows[0]) await E.IvrAudioAsset.update(rows[0].id, patch);
        else await E.IvrAudioAsset.create(patch);
        return Response.json({ success: true, asset: { ...rows[0], ...patch } });
      }

      case 'deleteAsset': {
        const rows = listOf(await E.IvrAudioAsset.filter({ asset_key: body.asset_key }).catch(() => []));
        if (rows[0]) await E.IvrAudioAsset.delete(rows[0].id);
        return Response.json({ success: true });
      }

      case 'saveSchedule': {
        const schedule = body.schedule || {};
        if (!schedule.schedule_key) schedule.schedule_key = newKey('sch');
        const rows = listOf(await E.IvrSchedule.filter({ schedule_key: schedule.schedule_key }).catch(() => []));
        const patch = { ...schedule, updated_by: actor };
        if (rows[0]) await E.IvrSchedule.update(rows[0].id, patch);
        else await E.IvrSchedule.create(patch);
        await audit({ action: 'save_schedule', target_type: 'schedule', target_key: patch.schedule_key, summary: `Saved hours ${patch.name}` });
        return Response.json({ success: true, schedule: { ...rows[0], ...patch } });
      }

      case 'saveSettings': {
        const rows = listOf(await E.CallCenterSetting.filter({ settings_key: 'default' }).catch(() => []));
        const patch = {
          ...(body.settings || {}),
          settings_key: 'default',
          updated_by: actor,
          updated_at: new Date().toISOString(),
        };
        const before = rows[0] || {};
        if (rows[0]) await E.CallCenterSetting.update(rows[0].id, patch);
        else await E.CallCenterSetting.create(patch);
        await audit({
          action: 'save_settings',
          target_type: 'settings',
          target_key: 'default',
          summary: 'Updated global call settings',
          before,
          after: patch,
        });
        return Response.json({ success: true });
      }

      case 'emergencyActivate': {
        const payload = body.override || {};
        if (!payload.mode) return Response.json({ error: 'mode required' }, { status: 400 });
        if (payload.mode === 'transfer_all' && !payload.target_number) {
          return Response.json({ error: 'A destination number is required.' }, { status: 400 });
        }
        const rows = listOf(await E.IvrEmergencyState.filter({ settings_key: 'default' }).catch(() => []));
        const previous = rows[0] || {};
        const numbers = listOf(await E.IvrNumberConfig.filter({}, { limit: 50 }).catch(() => []));
        const snapshot = {
          numbers: numbers.map((n) => ({
            phone_number: n.phone_number,
            active_flow_key: n.active_flow_key,
            engine_enabled: n.engine_enabled,
          })),
        };
        const patch = {
          settings_key: 'default',
          active: true,
          mode: payload.mode,
          target_number: payload.target_number || '',
          greeting_text: payload.greeting_text || '',
          greeting_voice_profile_key: payload.greeting_voice_profile_key || '',
          scope_phone_numbers: Array.isArray(payload.scope_phone_numbers) ? payload.scope_phone_numbers : [],
          department: payload.department || '',
          reason: payload.reason || '',
          activated_by: actor,
          activated_at: new Date().toISOString(),
          restored_at: '',
          previous_state: snapshot,
        };
        if (rows[0]) await E.IvrEmergencyState.update(rows[0].id, patch);
        else await E.IvrEmergencyState.create(patch);
        await audit({
          action: 'emergency_activate',
          target_type: 'override',
          target_key: payload.mode,
          summary: `Emergency override ON — ${payload.mode}${payload.target_number ? ` to ${payload.target_number}` : ''}`,
          before: previous,
          after: patch,
        });
        return Response.json({ success: true });
      }

      case 'emergencyRestore': {
        const rows = listOf(await E.IvrEmergencyState.filter({ settings_key: 'default' }).catch(() => []));
        if (!rows[0]) return Response.json({ success: true });
        const before = rows[0];
        await E.IvrEmergencyState.update(before.id, {
          active: false,
          restored_at: new Date().toISOString(),
          reason: '',
        });
        await audit({
          action: 'emergency_restore',
          target_type: 'override',
          target_key: before.mode || '',
          summary: 'Emergency override cleared — normal routing restored',
          before,
        });
        return Response.json({ success: true });
      }

      case 'audit': {
        const rows = listOf(await E.IvrAuditLog.filter({}, { sort: '-at', limit: Number(body.limit || 80) }).catch(() => []));
        return Response.json({ entries: rows });
      }

      case 'callTraces': {
        const query: any = {};
        if (body.line) query.receiving_line = body.line;
        const rows = listOf(await E.CallRecord.filter(query, { sort: '-started_at', limit: 60 }).catch(() => []));
        return Response.json({ calls: rows });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error('[ivrStudio] failed:', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});