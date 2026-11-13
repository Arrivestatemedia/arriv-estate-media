/**
 * ivrFlowEngine — the flow model shared by the live runtime (ivrEngine) and the
 * administration studio (ivrStudio).
 *
 * A flow is a list of nodes. Every outgoing edge is a target node id stored
 * either in `next` (default/success/failure/… ) or inside config (`*_target`,
 * menu option targets). Because edges are discovered by matching node ids, the
 * studio can validate and draw a flow without a second graph structure that
 * could drift from what the runtime actually does.
 */

export type IvrNode = {
  id: string;
  type: string;
  label?: string;
  x?: number;
  y?: number;
  config?: Record<string, any>;
  next?: Record<string, string>;
};

export type IvrFlow = {
  flow_key: string;
  name?: string;
  status?: string;
  version?: number;
  start_node_id?: string;
  nodes?: IvrNode[];
};

export type CallerContext = {
  caller_number: string;
  dialed_number: string;
  caller_type: string;
  caller_name: string;
  caller_email: string;
  caller_role: string;
  employee_status: string;
  applicant_status: string;
  application_stage: string;
  client_status: string;
  prospect_assigned: string;
  assigned_rep: string;
  business_hours: string;
  holiday: string;
  weekday: number;
  minutes_of_day: number;
  previous_selection: string;
  previous_failed_transfer: string;
  custom: Record<string, string>;
};

export const NODE_TYPES = [
  'incoming_call',
  'play_greeting',
  'announcement',
  'ivr_menu',
  'gather_keypad',
  'gather_speech',
  'conditional_branch',
  'business_hours',
  'holiday_schedule',
  'transfer_number',
  'transfer_extension',
  'ring_group',
  'queue',
  'play_hold_music',
  'voicemail',
  'send_sms',
  'request_callback',
  'ashley_ai',
  'db_lookup',
  'webhook',
  'return_previous',
  'end_call',
];

export const MENU_TYPES = ['ivr_menu', 'gather_keypad'];

/* ───────────────────────── graph helpers ───────────────────────── */

export function nodeMap(flow: IvrFlow): Record<string, IvrNode> {
  const map: Record<string, IvrNode> = {};
  (flow?.nodes || []).forEach((n) => {
    if (n?.id) map[n.id] = n;
  });
  return map;
}

export function startNode(flow: IvrFlow): IvrNode | null {
  const map = nodeMap(flow);
  const id = flow?.start_node_id;
  if (id && map[id]) return map[id];
  const first = (flow?.nodes || [])[0];
  return first || null;
}

function walkTargets(value: unknown, ids: Set<string>, out: string[]) {
  if (typeof value === 'string') {
    if (ids.has(value) && !out.includes(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => walkTargets(v, ids, out));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => walkTargets(v, ids, out));
  }
}

/** Every node this node can lead to, in a stable order. */
export function targetsOf(node: IvrNode, flow: IvrFlow): string[] {
  const ids = new Set(Object.keys(nodeMap(flow)));
  const out: string[] = [];
  walkTargets(node?.next || {}, ids, out);
  walkTargets(node?.config || {}, ids, out);
  return out;
}

export function allEdges(flow: IvrFlow): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  (flow?.nodes || []).forEach((n) => {
    targetsOf(n, flow).forEach((to) => edges.push({ from: n.id, to }));
  });
  return edges;
}

export function findCycles(flow: IvrFlow): string[][] {
  const map = nodeMap(flow);
  const found: string[][] = [];
  const seen = new Set<string>();
  const walk = (id: string, path: string[]) => {
    if (path.includes(id)) {
      const cycle = path.slice(path.indexOf(id));
      const key = [...cycle].sort().join('>');
      if (!seen.has(key)) {
        seen.add(key);
        found.push([...cycle, id]);
      }
      return;
    }
    if (path.length > 25) return;
    const node = map[id];
    if (!node) return;
    targetsOf(node, flow).forEach((next) => walk(next, [...path, id]));
  };
  (flow?.nodes || []).forEach((n) => walk(n.id, []));
  return found;
}

export function unreachableNodes(flow: IvrFlow): string[] {
  const map = nodeMap(flow);
  const start = startNode(flow);
  if (!start) return [];
  const visited = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift() as string;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = map[id];
    if (!node) continue;
    targetsOf(node, flow).forEach((t) => {
      if (!visited.has(t)) queue.push(t);
    });
  }
  return Object.keys(map).filter((id) => !visited.has(id));
}

/* ───────────────────────── validation ───────────────────────── */

export type FlowIssue = { severity: 'error' | 'warning'; node_id?: string; message: string };

export function isValidDestination(value: string): boolean {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return /^\+?\d{10,15}$/.test(digits);
}

export function validateFlow(flow: IvrFlow): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const nodes = flow?.nodes || [];
  const map = nodeMap(flow);

  if (!nodes.length) {
    issues.push({ severity: 'error', message: 'The flow has no nodes yet.' });
    return issues;
  }
  if (!flow.start_node_id || !map[flow.start_node_id]) {
    issues.push({ severity: 'error', message: 'No start node is selected, so a call has nowhere to enter.' });
  }

  nodes.forEach((node) => {
    const cfg = node.config || {};
    const label = node.label || node.type;
    if (!NODE_TYPES.includes(node.type)) {
      issues.push({ severity: 'error', node_id: node.id, message: `${label}: unknown node type "${node.type}".` });
    }

    if (['play_greeting', 'announcement'].includes(node.type) && !String(cfg.text || '').trim()) {
      issues.push({ severity: 'error', node_id: node.id, message: `${label}: no text to speak.` });
    }
    if (MENU_TYPES.includes(node.type)) {
      const options = Array.isArray(cfg.options) ? cfg.options : [];
      if (!options.length) {
        issues.push({ severity: 'error', node_id: node.id, message: `${label}: the menu has no keypad options.` });
      }
      options.forEach((o: any) => {
        if (!o?.target) {
          issues.push({ severity: 'warning', node_id: node.id, message: `${label}: option ${o?.key || '?'} goes nowhere.` });
        }
      });
      if (!String(cfg.prompt || '').trim()) {
        issues.push({ severity: 'error', node_id: node.id, message: `${label}: no prompt is spoken before the keypad.` });
      }
    }
    if (['transfer_number', 'transfer_extension'].includes(node.type) && !isValidDestination(cfg.number || '')) {
      issues.push({ severity: 'error', node_id: node.id, message: `${label}: "${cfg.number || ''}" is not a usable phone number.` });
    }
    if (node.type === 'ring_group') {
      const members = (Array.isArray(cfg.members) ? cfg.members : []).filter((m: any) => isValidDestination(m?.number || ''));
      if (!members.length) {
        issues.push({ severity: 'error', node_id: node.id, message: `${label}: the ring group has no valid numbers.` });
      }
    }
    if (node.type === 'ring_group' || node.type === 'transfer_number') {
      if (!node.next?.no_answer && !cfg.no_answer_target) {
        issues.push({ severity: 'warning', node_id: node.id, message: `${label}: nothing happens when nobody answers.` });
      }
    }
    if (node.type === 'webhook' && !/^https:\/\//.test(String(cfg.url || ''))) {
      issues.push({ severity: 'error', node_id: node.id, message: `${label}: the webhook URL must be https.` });
    }
    if (node.type === 'voicemail' && !String(cfg.prompt || '').trim()) {
      issues.push({ severity: 'warning', node_id: node.id, message: `${label}: callers hear nothing before the beep.` });
    }
    if (node.type === 'queue' && !String(cfg.hold_music_url || '').trim()) {
      issues.push({ severity: 'warning', node_id: node.id, message: `${label}: no hold music is configured.` });
    }
    if (node.type === 'db_lookup' && !node.next?.success) {
      issues.push({ severity: 'warning', node_id: node.id, message: `${label}: no success path is connected.` });
    }
    if (!['ivr_menu', 'gather_keypad', 'gather_speech', 'transfer_number', 'transfer_extension', 'ring_group', 'queue', 'voicemail', 'send_sms', 'request_callback', 'ashley_ai', 'end_call', 'return_previous'].includes(node.type)) {
      if (!targetsOf(node, flow).length) {
        issues.push({ severity: 'error', node_id: node.id, message: `${label}: the call stops here with no next step.` });
      }
    }
  });

  unreachableNodes(flow).forEach((id) => {
    issues.push({
      severity: 'warning',
      node_id: id,
      message: `"${map[id]?.label || map[id]?.type}" can never be reached from the start node.`,
    });
  });

  findCycles(flow).forEach((cycle) => {
    issues.push({
      severity: 'warning',
      message: `Possible loop: ${cycle.map((id) => map[id]?.label || id).join(' → ')}`,
    });
  });

  return issues;
}

/* ───────────────────────── conditions & rules ───────────────────────── */

export function conditionValue(ctx: CallerContext, field: string): string {
  const direct = (ctx as any)?.[field];
  if (direct !== undefined && direct !== null) return String(direct);
  const custom = ctx?.custom?.[field];
  return custom !== undefined && custom !== null ? String(custom) : '';
}

export function evaluateCondition(ctx: CallerContext, condition: any): boolean {
  const field = String(condition?.field || '');
  const operator = String(condition?.operator || 'equals');
  const expected = String(condition?.value ?? '');
  const actual = conditionValue(ctx, field);
  const a = actual.toLowerCase();
  const b = expected.toLowerCase();

  switch (operator) {
    case 'not_equals':
      return a !== b;
    case 'contains':
      return b !== '' && a.includes(b);
    case 'starts_with':
      return b !== '' && a.startsWith(b);
    case 'in':
      return b.split(',').map((x) => x.trim()).filter(Boolean).includes(a);
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'exists':
      return actual.trim() !== '';
    case 'equals':
    default:
      return a === b;
  }
}

export function evaluateConditions(ctx: CallerContext, match: string, conditions: any[]): boolean {
  const list = Array.isArray(conditions) ? conditions.filter((c) => c && c.field) : [];
  if (!list.length) return false;
  return match === 'any'
    ? list.some((c) => evaluateCondition(ctx, c))
    : list.every((c) => evaluateCondition(ctx, c));
}

/** Highest-priority enabled rule whose conditions match the live call. */
export function pickRule(rules: any[], ctx: CallerContext): any | null {
  const sorted = [...(rules || [])]
    .filter((r) => r?.enabled !== false)
    .sort((x, y) => Number(x.priority ?? 100) - Number(y.priority ?? 100));
  for (const rule of sorted) {
    if (evaluateConditions(ctx, rule.match || 'all', rule.conditions)) return rule;
  }
  return null;
}

/* ───────────────────────── schedule ───────────────────────── */

function minutesFromHHMM(value: string): number | null {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function scheduleState(schedule: any, now: Date): { open: boolean; holiday: boolean; reason: string } {
  if (!schedule) return { open: true, holiday: false, reason: 'no schedule configured' };
  const tz = schedule.timezone || 'America/New_York';
  let parts: Record<string, string> = {};
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    fmt.formatToParts(now).forEach((p) => {
      parts[p.type] = p.value;
    });
  } catch {
    parts = {};
  }

  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday || '');
  const minutes = Number(parts.hour || '0') * 60 + Number(parts.minute || '0');
  const dateKey = `${parts.year || ''}-${parts.month || ''}-${parts.day || ''}`;

  const holiday = (schedule.holidays || []).find((h: any) => h?.date === dateKey);
  if (holiday) {
    const open = minutesFromHHMM(holiday.open);
    const close = minutesFromHHMM(holiday.close);
    if (holiday.closed || open === null || close === null) {
      return { open: false, holiday: true, reason: `holiday: ${holiday.label || holiday.date}` };
    }
    return {
      open: minutes >= open && minutes < close,
      holiday: true,
      reason: `holiday hours: ${holiday.label || holiday.date}`,
    };
  }

  const day = (schedule.weekly || []).find((w: any) => Number(w?.day) === dayIndex);
  if (!day || day.closed) return { open: false, holiday: false, reason: 'closed today' };
  const open = minutesFromHHMM(day.open);
  const close = minutesFromHHMM(day.close);
  if (open === null || close === null) return { open: true, holiday: false, reason: 'open all day' };
  const isOpen = open <= close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
  return { open: isOpen, holiday: false, reason: isOpen ? 'within business hours' : 'outside business hours' };
}

/* ───────────────────────── simulation ───────────────────────── */

export type TraceStep = {
  node_id: string;
  type: string;
  label: string;
  detail: string;
};

export function simulateFlow(
  flow: IvrFlow,
  ctx: CallerContext,
  keypad: string[],
  options: { schedule?: any; now?: Date } = {}
): { trace: TraceStep[]; result: string; issues: FlowIssue[] } {
  const map = nodeMap(flow);
  const trace: TraceStep[] = [];
  const issues: FlowIssue[] = [];
  const inputs = [...(keypad || [])];
  let node = startNode(flow);
  let guard = 0;
  let result = 'The call ended without a spoken outcome.';

  while (node && guard < 80) {
    guard += 1;
    const cfg = node.config || {};
    const label = node.label || node.type;
    const next = node.next || {};

    if (MENU_TYPES.includes(node.type)) {
      const optionsList = Array.isArray(cfg.options) ? cfg.options : [];
      const digit = inputs.shift();
      trace.push({
        node_id: node.id,
        type: node.type,
        label,
        detail: digit
          ? `Caller pressed ${digit}`
          : `Menu played: ${String(cfg.prompt || '').slice(0, 120)}`,
      });
      if (!digit) {
        result = 'The menu was heard and the caller made no further selection.';
        break;
      }
      const match = optionsList.find((o: any) => String(o.key) === String(digit));
      if (!match?.target) {
        const fallback = cfg.invalid_target || next.invalid;
        trace.push({ node_id: node.id, type: 'branch', label: 'Unrecognised key', detail: `Pressed ${digit}, no option bound` });
        if (!fallback) {
          result = `Pressed ${digit} — no option is bound to that key, so the call would end.`;
          break;
        }
        node = map[fallback];
        continue;
      }
      node = map[match.target];
      continue;
    }

    switch (node.type) {
      case 'incoming_call':
        trace.push({ node_id: node.id, type: node.type, label, detail: 'Call enters the flow' });
        node = map[next.default];
        break;
      case 'play_greeting':
      case 'announcement': {
        trace.push({ node_id: node.id, type: node.type, label, detail: `Says: ${String(cfg.text || '').slice(0, 160)}` });
        const follow = cfg.gather ? cfg.gather_target : next.default;
        if (!targetsOf(node, flow).length) {
          result = 'The message plays and the call ends.';
          node = null;
        } else {
          node = map[follow] || map[targetsOf(node, flow)[0]];
        }
        break;
      }
      case 'gather_speech': {
        const said = inputs.shift();
        const routes = Array.isArray(cfg.routes) ? cfg.routes : [];
        const route = said
          ? routes.find((r: any) =>
              String(r.keywords || '')
                .split(',')
                .map((k) => k.trim().toLowerCase())
                .filter(Boolean)
                .some((k: string) => said.toLowerCase().includes(k))
            )
          : null;
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: said ? `Caller said "${said}"` : `Prompt: ${String(cfg.prompt || '').slice(0, 120)}`,
        });
        if (!said) {
          result = 'The caller said nothing.';
          break;
        }
        node = map[route?.target || cfg.no_match_target || next.failure];
        break;
      }
      case 'conditional_branch': {
        const ok = evaluateConditions(ctx, cfg.match || 'all', cfg.conditions || []);
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: `${ok ? 'Conditions matched' : 'Conditions did not match'} (${(cfg.conditions || []).length} condition(s))`,
        });
        node = map[(ok ? cfg.true_target : cfg.false_target) || next[ok ? 'success' : 'failure']];
        break;
      }
      case 'business_hours': {
        const state = scheduleState(options.schedule, options.now || new Date());
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: `${state.open ? 'Open' : 'Closed'} — ${state.reason}`,
        });
        node = map[(state.open ? cfg.open_target : cfg.closed_target) || next[state.open ? 'success' : 'failure']];
        break;
      }
      case 'holiday_schedule': {
        const state = scheduleState(options.schedule, options.now || new Date());
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: state.holiday ? 'Holiday schedule is in force' : 'Not a holiday',
        });
        node = map[(state.holiday ? cfg.holiday_target : cfg.normal_target) || next.default];
        break;
      }
      case 'transfer_number':
      case 'transfer_extension': {
        const number = node.type === 'transfer_extension'
          ? (Array.isArray(cfg.map) ? cfg.map : []).find((m: any) => String(m.extension) === String(cfg.extension))?.number || ''
          : cfg.number;
        trace.push({ node_id: node.id, type: node.type, label, detail: `Transfers to ${number || '(no number)'}` });
        result = `Transferred to ${number || 'an unconfigured destination'}.`;
        node = null;
        break;
      }
      case 'ring_group': {
        const members = (Array.isArray(cfg.members) ? cfg.members : []).map((m: any) => `${m.name || 'Member'} ${m.number}`);
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: `${cfg.mode || 'simultaneous'} ring to ${members.join(', ') || '(no members)'}`,
        });
        result = `Rings ${members.join(', ') || 'nobody'}.`;
        node = null;
        break;
      }
      case 'queue': {
        trace.push({ node_id: node.id, type: node.type, label, detail: `Queued with hold music for up to ${cfg.max_wait_seconds || 120}s` });
        result = 'The caller waits in the queue.';
        node = null;
        break;
      }
      case 'play_hold_music':
        trace.push({ node_id: node.id, type: node.type, label, detail: `Hold music: ${cfg.hold_music_url || '(none)'}` });
        node = map[next.default];
        break;
      case 'voicemail':
        trace.push({ node_id: node.id, type: node.type, label, detail: `Records a message: ${String(cfg.prompt || '').slice(0, 120)}` });
        result = 'The caller leaves a voicemail.';
        node = null;
        break;
      case 'send_sms':
        trace.push({ node_id: node.id, type: node.type, label, detail: `Sends "${String(cfg.message || '').slice(0, 80)}"` });
        node = map[next.default];
        break;
      case 'request_callback':
        trace.push({ node_id: node.id, type: node.type, label, detail: 'Creates a callback request and confirms it' });
        result = 'A callback request is created.';
        node = null;
        break;
      case 'ashley_ai':
        trace.push({ node_id: node.id, type: node.type, label, detail: `Hands the call to Ashley (${cfg.department || 'general'})` });
        result = 'Ashley answers.';
        node = null;
        break;
      case 'db_lookup':
        trace.push({
          node_id: node.id,
          type: node.type,
          label,
          detail: `Looks up ${cfg.field || 'caller'} — recognised as ${ctx.caller_type || 'unknown'}`,
        });
        node = map[ctx.caller_type && ctx.caller_type !== 'unknown' ? cfg.success_target || next.success : cfg.failure_target || next.failure];
        break;
      case 'webhook':
        trace.push({ node_id: node.id, type: node.type, label, detail: `Calls ${cfg.url || '(no url)'}, then continues` });
        node = map[cfg.success_target || next.success || next.default];
        break;
      case 'return_previous': {
        const previous = inputs.previous_id || cfg.fallback_target || next.default;
        trace.push({ node_id: node.id, type: node.type, label, detail: 'Returns to the previous menu' });
        node = map[previous];
        break;
      }
      case 'end_call':
        trace.push({ node_id: node.id, type: node.type, label, detail: cfg.message ? `Says "${cfg.message}" then hangs up` : 'Hangs up' });
        result = 'The call ends.';
        node = null;
        break;
      default:
        trace.push({ node_id: node.id, type: node.type, label, detail: 'Unknown node type — the call would stop.' });
        result = 'The call stops on an unrecognised node.';
        node = null;
    }

    if (guard >= 79) {
      issues.push({ severity: 'error', message: 'The simulation hit the 80-step safety limit — the flow may loop.' });
    }
  }

  return { trace, result, issues };
}

/* ───────────────────────── speaking ───────────────────────── */

export function applyPronunciation(text: string, voice: any): string {
  let out = String(text || '');
  (voice?.pronunciation || []).forEach((p: any) => {
    const word = String(p?.word || '').trim();
    if (!word) return;
    out = out.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), String(p.replacement || word));
  });
  return out;
}

export function sayWithVoice(text: string, voice: any, escapeXml: (v: unknown) => string): string {
  const spoken = applyPronunciation(text, voice);
  const voiceId = voice?.voice_id || 'Polly.Joanna';
  const attrs = [`voice="${escapeXml(voiceId)}"`];
  if (voice?.language) attrs.push(`language="${escapeXml(voice.language)}"`);
  if (voice?.speech_rate) attrs.push(`rate="${escapeXml(voice.speech_rate)}"`);
  if (voice?.pitch) attrs.push(`pitch="${escapeXml(voice.pitch)}"`);
  return `<Say ${attrs.join(' ')}>${escapeXml(spoken)}</Say>`;
}