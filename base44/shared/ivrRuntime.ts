/**
 * ivrRuntime — the configuration-driven call runtime behind /functions/ivrEngine.
 *
 * Every call resolves its flow from the database on each request, so an
 * administrator can publish a new greeting, menu, voice or destination and the
 * very next call uses it, with no Base44 deployment.
 *
 * Safety contracts:
 *  - A number only uses this engine when an administrator has deliberately
 *    bound a published flow to it. Otherwise the call is redirected to the
 *    existing production routing (ivrRouter), so nothing working is interrupted.
 *  - A call pins the flow version it started on, so publishing mid-call does
 *    not change the menu under a caller's fingers.
 */

import { validateTwilioRequest } from './twilioWebhookValidation.ts';
import {
  e164,
  escapeXml,
  parseCall,
  redirect,
  url,
  xmlResponse,
  loadSettings,
  recognizeCaller,
  recognizeApplicant,
  upsertCall,
  logCallEvent,
  createCallback,
  saveVoicemail,
} from './ivr.ts';
import {
  pickRule,
  sayWithVoice,
  scheduleState,
  startNode,
  nodeMap,
} from './ivrFlowEngine.ts';
import type { CallerContext, IvrFlow, IvrNode } from './ivrFlowEngine.ts';

type EngineEnv = {
  base44: any;
  flow: IvrFlow;
  flowKey: string;
  version: number;
  stack: string;
  config: any;
  caller: any;
  ctx: CallerContext;
  voiceKey: string;
  settings: any;
  skipAshley: boolean;
  voices: any[];
  secret: (name: string) => string;
};

function listOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

function nodeUrl(env: EngineEnv, nodeId: string, extra: Record<string, string | number | undefined> = {}) {
  return url('/functions/ivrEngine', {
    flow: env.flowKey,
    node: nodeId,
    v: env.version,
    stack: env.stack,
    ...extra,
  });
}

function voiceOf(env: EngineEnv, key?: string) {
  const wanted = key || env.voiceKey;
  return (
    env.voices.find((v: any) => v.voice_key === wanted) ||
    env.voices.find((v: any) => v.is_default) ||
    env.voices[0] ||
    null
  );
}

function speak(env: EngineEnv, text: string, voiceKey?: string) {
  return sayWithVoice(text, voiceOf(env, voiceKey), escapeXml);
}

function publicCallerId(env: EngineEnv) {
  if (env.config?.caller_id_mode === 'custom' && env.config?.caller_id_number) return env.config.caller_id_number;
  if (env.config?.caller_id_mode === 'caller_number') return e164(env.caller?.number || '');
  return e164(env.config?.phone_number || '');
}

function advance(env: EngineEnv, node: IvrNode, key = 'default') {
  const target = node?.next?.[key] || node?.config?.[`${key}_target`];
  return target ? redirect(nodeUrl(env, target)) : '<Hangup/>';
}

function dialTag(
  env: EngineEnv,
  numbers: { number: string; name?: string }[],
  opts: { timeout?: number; whisper?: string; actionNode?: string; actionMode?: string }
) {
  const whisperText = opts.whisper ? encodeURIComponent(opts.whisper) : '';
  const whisperUrl = whisperText
    ? url('/functions/ivrEngine', { mode: 'whisper', text: whisperText, voice: env.voiceKey })
    : '';
  const action = url('/functions/ivrEngine', {
    flow: env.flowKey,
    node: opts.actionNode || '',
    v: env.version,
    mode: opts.actionMode || 'dial_result',
  });
  const inner = numbers
    .map(
      (n) =>
        `<Number${whisperUrl ? ` url="${escapeXml(whisperUrl)}"` : ''}>${escapeXml(e164(n.number))}</Number>`
    )
    .join('');
  return `<Dial callerId="${escapeXml(publicCallerId(env))}" timeout="${
    opts.timeout || 25
  }" answerOnBridge="true" action="${escapeXml(action)}">${inner}</Dial>`;
}

async function sendSms(env: EngineEnv, to: string, message: string) {
  const sid = env.secret('TWILIO_ACCOUNT_SID');
  const token = env.secret('TWILIO_AUTH_TOKEN');
  const from = e164(env.config?.phone_number || env.secret('TWILIO_PHONE_NUMBER') || '');
  if (!sid || !token || !from || !to) return false;
  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    return res.ok;
  } catch (e) {
    console.error('[ivrEngine] sms failed:', (e as Error).message);
    return false;
  }
}

export async function handleIvrRequest(req: Request, base44: any, secretsRef: any): Promise<Response> {
  const secret = (name: string) => {
    try {
      return String(secretsRef?.get?.(name) || '');
    } catch {
      return '';
    }
  };

  const { raw, params, query } = await parseCall(req);
  const valid = await validateTwilioRequest(req, raw, 'ivrEngine');
  if (!valid) {
    console.error('[ivrEngine] signature verification failed');
    return xmlResponse('<Hangup/>');
  }

  try {
    const callSid = params.CallSid || '';
    const from = params.From || '';
    const to = params.To || '';
    const digits = String(params.Digits || '').trim();
    const speech = String(params.SpeechResult || '').trim();
    const mode = query.get('mode') || '';
    const E = base44.asServiceRole.entities;

    /* ---- private announcement, played to the answering person only ---- */
    if (mode === 'whisper') {
      const text = decodeURIComponent(query.get('text') || '');
      if (!text) return xmlResponse('');
      const voices = listOf(await E.IvrVoiceProfile.filter({}, { limit: 100 }).catch(() => []));
      const voice = voices.find((v: any) => v.voice_key === query.get('voice')) || voices[0] || null;
      return xmlResponse(sayWithVoice(text, voice, escapeXml));
    }

    const settings = await loadSettings(base44);
    const [numberRows, emergencyRows, voices] = await Promise.all([
      E.IvrNumberConfig.filter({ phone_number: e164(to) }).catch(() => []),
      E.IvrEmergencyState.filter({ settings_key: 'default' }).catch(() => []),
      E.IvrVoiceProfile.filter({ active: true }, { limit: 100 }).catch(() => []),
    ]);
    const config = listOf(numberRows)[0] || null;
    const emergency = listOf(emergencyRows)[0] || null;
    const voiceList = listOf(voices);

    /* ---- voicemail recording finished ---- */
    if (mode === 'vm_done') {
      const caller = await recognizeCaller(base44, from).catch(() => null);
      if (params.RecordingUrl && caller) {
        await saveVoicemail(base44, {
          call_sid: callSid,
          caller,
          from,
          to,
          category: query.get('category') || 'general',
          reason: query.get('reason') || '',
          recordingUrl: params.RecordingUrl,
          recordingSid: params.RecordingSid || '',
          duration: Number(params.RecordingDuration || 0),
        }).catch(() => null);
      }
      const thanks =
        query.get('thanks') || 'Thank you. Your message has been saved and we will get back to you shortly.';
      return xmlResponse(`${sayWithVoice(thanks, voiceList[0] || null, escapeXml)}<Hangup/>`);
    }

    /* ---- which flow serves this call ---- */
    let flowRow: any = null;
    let pinnedVersion = Number(query.get('v') || 0);
    const flowKeyParam = query.get('flow') || '';

    if (flowKeyParam) {
      flowRow = listOf(await E.IvrFlow.filter({ flow_key: flowKeyParam }).catch(() => []))[0] || null;
    } else if (config?.active_flow_key) {
      flowRow = listOf(await E.IvrFlow.filter({ flow_key: config.active_flow_key }).catch(() => []))[0] || null;
    }

    const engineBound = !!config?.engine_enabled && !!config?.active_flow_key;

    // Nothing published for this number: existing production routing keeps the line.
    if (!flowKeyParam && (!engineBound || !flowRow || flowRow.status !== 'published')) {
      await upsertCall(base44, callSid, {
        receiving_line: config?.line || '',
        stage: 'engine_fallback_legacy',
        started_at: new Date().toISOString(),
      }).catch(() => null);
      return xmlResponse(redirect(url('/functions/ivrRouter')));
    }

    if (!flowRow) return xmlResponse(redirect(url('/functions/ivrRouter')));

    // Pin the version the call started on.
    let flow: IvrFlow = { ...flowRow, nodes: flowRow.nodes || [] };
    if (pinnedVersion && Number(flowRow.version || 0) !== pinnedVersion) {
      const versions = listOf(
        await E.IvrFlowVersion.filter({ flow_key: flowRow.flow_key, version: pinnedVersion }).catch(() => [])
      );
      if (versions[0]) {
        flow = { ...flowRow, nodes: versions[0].nodes || [], start_node_id: versions[0].start_node_id };
      }
    } else {
      pinnedVersion = Number(flowRow.version || 0);
    }

    /* ---- caller context ---- */
    const caller = await recognizeCaller(base44, from).catch(() => null);
    const applicant = await recognizeApplicant(base44, from).catch(() => null);
    let schedule: any = null;
    if (config?.schedule_key) {
      schedule =
        listOf(await E.IvrSchedule.filter({ schedule_key: config.schedule_key }).catch(() => []))[0] || null;
    }
    const hours = scheduleState(schedule, new Date());
    const now = new Date();
    const ctx: CallerContext = {
      caller_number: e164(from),
      dialed_number: e164(to),
      caller_type: caller?.type || 'unknown',
      caller_name: caller?.name || (applicant as any)?.name || '',
      caller_email: caller?.email || '',
      caller_role: caller?.type || '',
      employee_status: caller?.type === 'media_specialist' ? 'active' : '',
      applicant_status: (applicant as any)?.name ? 'applicant' : '',
      application_stage: (applicant as any)?.stage || '',
      client_status: caller?.type === 'client' || caller?.type === 'b2b_client' ? 'client' : '',
      prospect_assigned: caller?.type === 'prospect' ? caller?.assigned_rep?.full_name || 'assigned' : '',
      assigned_rep: caller?.assigned_rep?.full_name || '',
      business_hours: hours.open ? 'open' : 'closed',
      holiday: hours.holiday ? 'yes' : 'no',
      weekday: now.getDay(),
      minutes_of_day: now.getHours() * 60 + now.getMinutes(),
      previous_selection: query.get('last_digit') || '',
      previous_failed_transfer: query.get('failed') || '',
      custom: {},
    };

    const env: EngineEnv = {
      base44,
      flow,
      flowKey: flowRow.flow_key,
      version: pinnedVersion,
      stack: query.get('stack') || '',
      config,
      caller,
      ctx,
      voiceKey: config?.voice_profile_key || '',
      settings,
      skipAshley: emergency?.active === true && emergency?.mode === 'disable_ai',
      voices: voiceList,
      secret,
    };

    const record = await upsertCall(base44, callSid, {
      receiving_line: config?.line || '',
      started_at: new Date().toISOString(),
      caller_type: ctx.caller_type as any,
      caller_name: ctx.caller_name,
      caller_email: ctx.caller_email,
      route: 'flow' as any,
      stage: query.get('node') || 'entry',
    }).catch(() => null);

    /* ---- emergency override ---- */
    const scope: string[] = Array.isArray(emergency?.scope_phone_numbers) ? emergency.scope_phone_numbers : [];
    const overrideApplies =
      emergency?.active === true && (!scope.length || scope.includes(e164(to))) && !flowKeyParam;

    if (overrideApplies && emergency.mode === 'transfer_all' && emergency.target_number) {
      await logCallEvent(base44, record, 'emergency_override', `transfer_all to ${emergency.target_number}`);
      return xmlResponse(
        `${
          emergency.greeting_text ? speak(env, emergency.greeting_text, emergency.greeting_voice_profile_key) : ''
        }${dialTag(env, [{ number: emergency.target_number }], { timeout: 30 })}`
      );
    }
    if (overrideApplies && emergency.mode === 'voicemail_only') {
      await logCallEvent(base44, record, 'emergency_override', 'voicemail_only');
      return xmlResponse(
        `${
          emergency.greeting_text ? speak(env, emergency.greeting_text, emergency.greeting_voice_profile_key) : ''
        }${sayWithVoice('Please leave a message after the tone.', voiceOf(env), escapeXml)}<Record action="${escapeXml(
          url('/functions/ivrEngine', { mode: 'vm_done', category: 'general' })
        )}" maxLength="180" playBeep="true"/>`
      );
    }

    /* ---- caller-recognition rules ---- */
    let preRoll = '';
    let whisper = '';
    let forcedNode = '';
    if (!flowKeyParam && !query.get('node')) {
      const rules = listOf(await E.IvrCallerRule.filter({ enabled: true }, { limit: 200 }).catch(() => []));
      const rule = pickRule(rules, ctx);
      if (rule) {
        await logCallEvent(base44, record, 'caller_rule', `${rule.name} (priority ${rule.priority})`);
        await E.IvrCallerRule.update(rule.id, {
          match_count: Number(rule.match_count || 0) + 1,
          last_match_at: new Date().toISOString(),
        }).catch(() => null);
        for (const action of Array.isArray(rule.actions) ? rule.actions : []) {
          if (action.type === 'play_greeting' && action.text) preRoll += speak(env, action.text, action.voice_profile_key);
          if (action.type === 'play_private_announcement' && action.text) whisper = action.text;
          if (action.type === 'route_menu' && action.target) forcedNode = action.target;
          if (action.type === 'transfer' && action.number) {
            return xmlResponse(
              `${preRoll}${dialTag(env, [{ number: action.number }], {
                timeout: 30,
                whisper: whisper || undefined,
              })}`
            );
          }
          if (action.type === 'voicemail') {
            return xmlResponse(
              `${preRoll}${sayWithVoice(
                action.text || 'Please leave a message after the tone.',
                voiceOf(env),
                escapeXml
              )}<Record action="${escapeXml(
                url('/functions/ivrEngine', { mode: 'vm_done', category: 'general' })
              )}" maxLength="${Number(config?.voicemail?.max_seconds || 180)}" playBeep="true"/>`
            );
          }
          if (action.type === 'route_ashley') return xmlResponse(`${preRoll}${redirect(url('/functions/ivrAshley'))}`);
          if (action.type === 'end_call') {
            return xmlResponse(`${preRoll}${action.text ? speak(env, action.text) : ''}<Hangup/>`);
          }
        }
      }
    }

    /* ---- node execution ---- */
    const map = nodeMap(flow);
    const nodeId = query.get('node') || forcedNode || flow.start_node_id || startNode(flow)?.id || '';
    const node = map[nodeId];

    if (!node) {
      await logCallEvent(base44, record, 'ivr_error', `missing node ${nodeId}`);
      return xmlResponse(
        `${sayWithVoice('Sorry, we could not complete this call. Please try again later.', voiceOf(env), escapeXml)}<Hangup/>`
      );
    }

    await logCallEvent(base44, record, 'ivr_node', `${flow.flow_key}:${node.id}:${node.type}`);
    await upsertCall(base44, callSid, { stage: `${flow.flow_key}:${node.id}` }).catch(() => null);

    const cfg = node.config || {};
    const next = node.next || {};

    switch (node.type) {
      case 'incoming_call':
        return xmlResponse(`${preRoll}${advance(env, node)}`);

      case 'play_greeting':
      case 'announcement': {
        const body = `${preRoll}${speak(env, cfg.text || '', cfg.voice_profile_key)}`;
        if (cfg.gather) {
          return xmlResponse(
            `<Gather numDigits="1" action="${escapeXml(nodeUrl(env, node.id))}" method="POST" timeout="${
              cfg.timeout || 6
            }">${body}</Gather>${advance(env, node, 'no_input')}`
          );
        }
        const target = next.default || cfg.next_target;
        return xmlResponse(target ? `${body}${redirect(nodeUrl(env, target))}` : `${body}<Hangup/>`);
      }

      case 'ivr_menu':
      case 'gather_keypad': {
        const options = Array.isArray(cfg.options) ? cfg.options : [];
        const attempt = Number(query.get('attempt') || 0);
        if (!digits) {
          const prompt = `${preRoll}${speak(env, cfg.prompt || '', cfg.voice_profile_key)}`;
          const exhausted = attempt + 1 >= Number(cfg.attempts || 3);
          const fallback = exhausted && cfg.no_input_target
            ? nodeUrl(env, cfg.no_input_target)
            : nodeUrl(env, node.id, { attempt: exhausted ? 0 : attempt + 1 });
          return xmlResponse(
            `<Gather numDigits="1" action="${escapeXml(
              nodeUrl(env, node.id, { attempt })
            )}" method="POST" timeout="${cfg.timeout || 6}">${prompt}</Gather>${redirect(fallback)}`
          );
        }
        const option = options.find((o: any) => String(o.key) === digits);
        if (!option?.target) {
          const invalid = cfg.invalid_target || next.invalid;
          const prompt = speak(
            env,
            cfg.invalid_prompt || 'Sorry, that was not a valid option.',
            cfg.voice_profile_key
          );
          return xmlResponse(
            invalid
              ? `${prompt}${redirect(nodeUrl(env, invalid))}`
              : `<Gather numDigits="1" action="${escapeXml(
                  nodeUrl(env, node.id)
                )}" method="POST" timeout="${cfg.timeout || 6}">${speak(
                  env,
                  cfg.prompt || '',
                  cfg.voice_profile_key
                )}</Gather>`
          );
        }
        await logCallEvent(base44, record, 'ivr_selection', `${node.id}: ${digits} to ${option.label || option.target}`);
        return xmlResponse(redirect(nodeUrl(env, option.target, { last_digit: digits, failed: '' })));
      }

      case 'gather_speech': {
        const routes = Array.isArray(cfg.routes) ? cfg.routes : [];
        if (!speech) {
          return xmlResponse(
            `<Gather input="speech" speechTimeout="auto"${
              cfg.hints ? ` hints="${escapeXml(cfg.hints)}"` : ''
            }${cfg.language ? ` language="${escapeXml(cfg.language)}"` : ''} action="${escapeXml(
              nodeUrl(env, node.id)
            )}" method="POST">${speak(env, cfg.prompt || '', cfg.voice_profile_key)}</Gather>${advance(
              env,
              node,
              'no_input'
            )}`
          );
        }
        const route = routes.find((r: any) =>
          String(r.keywords || '')
            .split(',')
            .map((k: string) => k.trim().toLowerCase())
            .filter(Boolean)
            .some((k: string) => speech.toLowerCase().includes(k))
        );
        await logCallEvent(
          base44,
          record,
          'ivr_speech',
          `"${speech.slice(0, 120)}" to ${route?.target || 'no match'}`
        );
        const target = route?.target || cfg.no_match_target || next.failure;
        return xmlResponse(target ? redirect(nodeUrl(env, target)) : advance(env, node, 'failure'));
      }

      case 'conditional_branch': {
        const matched = pickRule(
          [{ priority: 1, enabled: true, match: cfg.match, conditions: cfg.conditions, actions: [] }],
          ctx
        );
        const target = matched ? cfg.true_target || next.success : cfg.false_target || next.failure;
        return xmlResponse(target ? redirect(nodeUrl(env, target)) : '<Hangup/>');
      }

      case 'business_hours': {
        const state = scheduleState(schedule, new Date());
        const target = state.open ? cfg.open_target || next.success : cfg.closed_target || next.failure;
        return xmlResponse(target ? `${preRoll}${redirect(nodeUrl(env, target))}` : `${preRoll}<Hangup/>`);
      }

      case 'holiday_schedule': {
        const state = scheduleState(schedule, new Date());
        const target = state.holiday ? cfg.holiday_target || next.default : cfg.normal_target || next.default;
        return xmlResponse(target ? redirect(nodeUrl(env, target)) : '<Hangup/>');
      }

      case 'transfer_number':
      case 'transfer_extension': {
        const number =
          node.type === 'transfer_extension'
            ? (Array.isArray(cfg.map) ? cfg.map : []).find(
                (m: any) => String(m.extension) === String(cfg.extension)
              )?.number || ''
            : cfg.number;
        if (!number) {
          await logCallEvent(base44, record, 'ivr_error', `no destination on ${node.id}`);
          return xmlResponse(
            `${preRoll}${sayWithVoice(
              'Sorry, that department is unavailable. Please hold.',
              voiceOf(env),
              escapeXml
            )}${advance(env, node, 'failure')}`
          );
        }
        return xmlResponse(
          `${preRoll}${dialTag(env, [{ number }], {
            timeout: Number(cfg.timeout || 25),
            whisper: cfg.whisper_text || undefined,
            actionNode: node.id,
          })}`
        );
      }

      case 'ring_group': {
        const members = (Array.isArray(cfg.members) ? cfg.members : []).filter((m: any) => m?.number);
        if (!members.length) return xmlResponse(`${preRoll}${advance(env, node, 'no_answer')}`);
        const whisper =
          cfg.whisper_text ||
          `Incoming call for Arriv Estate Media from ${ctx.caller_name || ctx.caller_number}.`;
        if ((cfg.mode || 'simultaneous') === 'sequential') {
          return xmlResponse(
            `${preRoll}${dialTag(env, [members[0]], {
              timeout: Number(cfg.ring_seconds || 18),
              whisper,
              actionNode: node.id,
              actionMode: 'rg_next',
            })}`
          );
        }
        return xmlResponse(
          `${preRoll}${dialTag(env, members, {
            timeout: Number(cfg.ring_seconds || 22),
            whisper,
            actionNode: node.id,
          })}`
        );
      }

      case 'queue': {
        const hold = cfg.hold_music_url || '';
        return xmlResponse(
          `${preRoll}${speak(env, cfg.prompt || 'Please hold while we connect you.', cfg.voice_profile_key)}${
            hold ? `<Play loop="${Number(cfg.loop || 3)}">${escapeXml(hold)}</Play>` : ''
          }<Gather numDigits="1" action="${escapeXml(nodeUrl(env, node.id))}" method="POST" timeout="8">${speak(
            env,
            cfg.leave_message_prompt || 'Press 1 to leave a message and we will call you back.',
            cfg.voice_profile_key
          )}</Gather>${advance(env, node, 'no_answer')}`
        );
      }

      case 'play_hold_music': {
        const hold = cfg.hold_music_url || '';
        return xmlResponse(
          `${preRoll}${hold ? `<Play loop="${Number(cfg.loop || 3)}">${escapeXml(hold)}</Play>` : ''}${advance(
            env,
            node,
            'default'
          )}`
        );
      }

      case 'voicemail':
        return xmlResponse(
          `${preRoll}${speak(
            env,
            cfg.prompt || 'Please leave a message after the tone.',
            cfg.voice_profile_key
          )}<Record action="${escapeXml(
            url('/functions/ivrEngine', {
              mode: 'vm_done',
              category: cfg.category || 'general',
              reason: cfg.reason || '',
            })
          )}" maxLength="${Number(
            cfg.max_seconds || config?.voicemail?.max_seconds || 180
          )}" transcribe="${cfg.transcribe ? 'true' : 'false'}" playBeep="true"/>${speak(
            env,
            'We did not receive a message. Goodbye.',
            cfg.voice_profile_key
          )}<Hangup/>`
        );

      case 'send_sms': {
        const target = cfg.to === 'custom' ? e164(cfg.number || '') : e164(from);
        const text = String(cfg.message || '').replace(/\{name\}/g, ctx.caller_name || 'there');
        const sent = await sendSms(env, target, text || 'Arriv Estate Media');
        await logCallEvent(base44, record, 'ivr_sms', `${sent ? 'sent' : 'failed'} ${target}`);
        return xmlResponse(`${preRoll}${advance(env, node, sent ? 'success' : 'failure')}`);
      }

      case 'request_callback': {
        try {
          await createCallback(base44, {
            call_sid: callSid,
            caller,
            from,
            to,
            category: cfg.category || 'general',
            reason: cfg.reason || 'Requested during the call flow',
            settings,
          });
          await logCallEvent(base44, record, 'callback_requested', node.id);
        } catch (e) {
          await logCallEvent(base44, record, 'ivr_error', `callback failed: ${(e as Error).message}`);
        }
        return xmlResponse(
          `${preRoll}${speak(
            env,
            cfg.prompt || 'Thank you. We have your number and will call you back shortly.',
            cfg.voice_profile_key
          )}<Hangup/>`
        );
      }

      case 'ashley_ai': {
        if (env.skipAshley) {
          const target = cfg.fallback_target || next.failure || next.default;
          await logCallEvent(base44, record, 'ashley_skipped', 'AI answering disabled by override');
          return xmlResponse(target ? redirect(nodeUrl(env, target)) : '<Hangup/>');
        }
        await logCallEvent(base44, record, 'ashley', cfg.department || 'general');
        return xmlResponse(`${preRoll}${redirect(url('/functions/ivrAshley'))}`);
      }

      case 'db_lookup': {
        const recognised = !!ctx.caller_type && ctx.caller_type !== 'unknown';
        const target = recognised ? cfg.success_target || next.success : cfg.failure_target || next.failure;
        return xmlResponse(target ? `${preRoll}${redirect(nodeUrl(env, target))}` : `${preRoll}<Hangup/>`);
      }

      case 'webhook': {
        let ok = false;
        try {
          if (/^https:\/\//.test(String(cfg.url || ''))) {
            const res = await fetch(cfg.url, {
              method: cfg.method || 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ call_sid: callSid, caller: ctx, flow: env.flowKey, node: node.id }),
              signal: AbortSignal.timeout(6000),
            });
            ok = res.ok;
          }
        } catch (e) {
          await logCallEvent(base44, record, 'ivr_error', `webhook failed: ${(e as Error).message}`);
        }
        const target = ok ? cfg.success_target || next.success : cfg.failure_target || next.failure;
        return xmlResponse(target ? redirect(nodeUrl(env, target)) : '<Hangup/>');
      }

      case 'return_previous': {
        const stack = env.stack ? env.stack.split(',').filter(Boolean) : [];
        const previous = stack.pop();
        const target = previous || cfg.fallback_target || next.default;
        return xmlResponse(
          target
            ? redirect(
                url('/functions/ivrEngine', {
                  flow: env.flowKey,
                  node: target,
                  v: env.version,
                  stack: stack.join(','),
                })
              )
            : '<Hangup/>'
        );
      }

      case 'end_call':
        return xmlResponse(
          `${preRoll}${cfg.message ? speak(env, cfg.message, cfg.voice_profile_key) : ''}<Hangup/>`
        );

      default:
        return xmlResponse(
          `${sayWithVoice('Sorry, this call could not be completed.', voiceOf(env), escapeXml)}<Hangup/>`
        );
    }
  } catch (e) {
    console.error('[ivrEngine] failed:', (e as Error).message);
    return xmlResponse(
      '<Say voice="Polly.Joanna">We are unable to complete your call right now. Please try again.</Say><Hangup/>'
    );
  }
}