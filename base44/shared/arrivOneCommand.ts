/**
 * Arriv One AI command engine.
 *
 * One interpret → review → apply loop shared by every surface (dashboard,
 * prospecting, prospect detail, dialer, call history). Nothing here writes a
 * record until an execution is explicitly applied, and every write is
 * idempotent per execution so a double tap cannot create two prospects.
 *
 * Hard rules encoded below:
 *  - A phone number or email is never invented; missing values stay missing.
 *  - A spoken name that matches several contacts is returned as candidates and
 *    blocks the write until the user picks one.
 *  - Only existing lead statuses are used (NEW / CONNECTED / CONVERTED); the
 *    model is not allowed to invent new pipeline names.
 */

const MAX_CANDIDATES = 5;

export const ALLOWED_LEAD_STATUSES = ['NEW', 'CONNECTED', 'CONVERTED'];

export const INTENTS = [
  'create_prospect',
  'update_prospect',
  'log_call',
  'create_task',
  'update_status',
  'find_prospect',
  'lookup_email',
  'unknown',
];

export const INTERPRET_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    confidence: { type: 'number' },
    extracted: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        full_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        company: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        package_interest: { type: 'string' },
        call_outcome: { type: 'string' },
        note: { type: 'string' },
        lead_status: { type: 'string' },
        follow_up_iso: { type: 'string' },
        follow_up_phrase: { type: 'string' },
        requested_action: { type: 'string' },
        lookup_email: { type: 'boolean' },
        corrections: { type: 'string' },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    clarifying_question: { type: 'string' },
  },
  required: ['intent', 'confidence', 'extracted'],
};

export const digits = (v: any) => String(v || '').replace(/\D/g, '');

/** 10 digits → +1, 11 leading 1 → +1, otherwise keep the plus form. */
export function normalizePhone(value: any) {
  const d = digits(value);
  if (!d) return '';
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length > 11) return `+${d}`;
  return '';
}

export function prettyPhone(value: any) {
  const n = normalizePhone(value);
  if (n.length === 12 && n.startsWith('+1')) {
    return `(${n.slice(2, 5)}) ${n.slice(5, 8)}-${n.slice(8)}`;
  }
  return n || String(value || '');
}

export const nameTokens = (name: any) =>
  String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

export const contactName = (c: any) =>
  [c?.firstname, c?.lastname].filter(Boolean).join(' ').trim() ||
  c?.name ||
  c?.email ||
  '';

const listOf = (v: any) => (Array.isArray(v) ? v : v?.items || []);

/**
 * Score existing CRM contacts against what was heard. Phone and email matches
 * dominate; name + company/location corroborate. Returned to the user for
 * confirmation rather than auto-selecting, even at high confidence.
 */
export async function matchContacts(base44: any, extracted: any) {
  const phone = normalizePhone(extracted?.phone);
  const email = String(extracted?.email || '').toLowerCase().trim();
  const tokens = nameTokens(extracted?.full_name || `${extracted?.first_name || ''} ${extracted?.last_name || ''}`);
  const company = String(extracted?.company || '').toLowerCase().trim();
  const city = String(extracted?.city || '').toLowerCase().trim();

  const pools: any[] = [];
  if (phone) {
    const last10 = phone.slice(-10);
    const rows = listOf(await base44.asServiceRole.entities.Contact.filter({}, { limit: 400 }).catch(() => []));
    pools.push(...rows.filter((c: any) => digits(c.phone).slice(-10) === last10));
  }
  if (email) {
    const rows = listOf(await base44.asServiceRole.entities.Contact.filter({ email }, { limit: 25 }).catch(() => []));
    pools.push(...rows);
  }
  if (tokens.length) {
    const rows = listOf(
      await base44.asServiceRole.entities.Contact.filter({}, { sort: '-updated_date', limit: 300 }).catch(() => [])
    );
    pools.push(
      ...rows.filter((c: any) => {
        const label = `${c.firstname || ''} ${c.lastname || ''}`.toLowerCase();
        return tokens.every((t: string) => label.includes(t)) || tokens.some((t: string) => label.includes(t));
      })
    );
  }

  const seen = new Set<string>();
  const scored: any[] = [];
  for (const c of pools) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    let score = 0;
    const reasons: string[] = [];
    if (phone && digits(c.phone).slice(-10) === digits(phone).slice(-10)) {
      score += 70;
      reasons.push('same phone number');
    }
    if (email && String(c.email || '').toLowerCase() === email) {
      score += 70;
      reasons.push('same email');
    }
    const label = `${c.firstname || ''} ${c.lastname || ''}`.toLowerCase();
    const matched = tokens.filter((t: string) => label.includes(t));
    if (tokens.length && matched.length === tokens.length) {
      score += 35;
      reasons.push('name matches');
    } else if (matched.length) {
      score += 15;
      reasons.push('partial name match');
    }
    if (company && String(c.company || '').toLowerCase().includes(company)) {
      score += 10;
      reasons.push('same brokerage');
    }
    if (city && String(c.billing_city || '').toLowerCase().includes(city)) {
      score += 8;
      reasons.push('same city');
    }
    if (score > 0) {
      scored.push({
        id: c.id,
        name: contactName(c),
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || '',
        city: c.billing_city || '',
        state: c.billing_state || '',
        lead_status: c.lead_status || '',
        score,
        reasons,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES);
}

export function interpretPrompt(text: string, context: any) {
  const now = context?.now_iso || new Date().toISOString();
  const tz = context?.timezone || 'America/New_York';
  const rep = context?.rep_name || 'the representative';
  return `You convert what an Arriv Estate Media sales representative said into structured CRM data.

The representative is ${rep}. Right now it is ${now} in ${tz}.

They said:
"""${text}"""

Decide exactly one intent:
- create_prospect: a person not yet in the CRM (add/create/new prospect).
- update_prospect: an existing person whose details change.
- log_call: the outcome of a call they just made (answered, no answer, voicemail, not interested, callback requested).
- create_task: a reminder or follow-up with no call outcome.
- update_status: change the pipeline status only.
- find_prospect: they want information about someone ("find", "look up", "what's the email").
- lookup_email: they specifically want a business email address for someone.
- unknown: nothing actionable.

Rules, all mandatory:
1. Never invent a phone number, email, brokerage or city. If it was not said, omit the field.
2. only set lead_status when the representative clearly indicates it, and only to NEW, CONNECTED or CONVERTED.
3. Resolve relative dates ("next Tuesday", "after Thanksgiving", "in two weeks", "tomorrow at 2") to follow_up_iso as a full ISO 8601 datetime in ${tz}, and repeat their words in follow_up_phrase. If a time was not given, use 9:00 AM local. If the date is genuinely ambiguous, put the ambiguity in warnings instead of guessing.
4. Put everything the representative said about the conversation in note, in their own words. Do not add observations they did not make.
5. If they asked to find an email as well as add the person, set lookup_email true.
6. If they corrected themselves ("no, I said Wilson"), use the correction as the real value and describe it in corrections.
7. If the person's identity is unclear (no name, only "him"), set a clarifying_question and lower confidence.
8. Split a full name into first_name and last_name. Keep full_name too.
9. Be explicit in warnings about anything uncertain: unclear phone digits, missing city, ambiguous date.

Return only the JSON object.`;
}

export async function interpretCommand(base44: any, text: string, context: any) {
  const result: any = await base44.integrations.Core.InvokeLLM({
    prompt: interpretPrompt(text, context),
    response_json_schema: INTERPRET_SCHEMA,
    model: 'gpt_5_mini',
  });
  const intent = INTENTS.includes(result?.intent) ? result.intent : 'unknown';
  const extracted = { ...(result?.extracted || {}) };
  if (extracted.phone) extracted.phone = normalizePhone(extracted.phone);
  if (extracted.lead_status && !ALLOWED_LEAD_STATUSES.includes(String(extracted.lead_status).toUpperCase())) {
    delete extracted.lead_status;
  } else if (extracted.lead_status) {
    extracted.lead_status = String(extracted.lead_status).toUpperCase();
  }
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : [];
  if (extracted.phone === '' && result?.extracted?.phone) {
    warnings.push('That phone number could not be read as a valid 10-digit US number — please confirm it.');
  }
  return {
    intent,
    confidence: Number(result?.confidence || 0),
    extracted,
    warnings,
    clarifying_question: result?.clarifying_question || '',
  };
}

/** Turn an interpretation into the exact changes the review screen shows. */
export function buildProposedActions(intent: string, extracted: any, candidates: any[], target: any) {
  const actions: any[] = [];
  const subject = extracted?.full_name || [extracted?.first_name, extracted?.last_name].filter(Boolean).join(' ');
  const who = target?.name || subject || 'this prospect';

  if (intent === 'create_prospect') {
    actions.push({
      type: 'create_contact',
      label: `Create ${subject || 'a new prospect'}`,
      fields: {
        firstname: extracted?.first_name || '',
        lastname: extracted?.last_name || '',
        phone: extracted?.phone || '',
        email: extracted?.email || '',
        company: extracted?.company || '',
        billing_city: extracted?.city || '',
        billing_state: extracted?.state || '',
        lead_status: extracted?.lead_status || 'NEW',
      },
    });
  }

  if (intent === 'update_prospect' || intent === 'update_status' || intent === 'log_call') {
    const changes: any = {};
    for (const key of ['phone', 'email', 'company', 'lead_status']) {
      if (extracted?.[key]) changes[key] = extracted[key];
    }
    if (extracted?.city) changes.billing_city = extracted.city;
    if (extracted?.state) changes.billing_state = extracted.state;
    if (Object.keys(changes).length) {
      actions.push({
        type: 'update_contact',
        label: `Update ${who}`,
        contact_id: target?.id || (candidates.length === 1 ? candidates[0].id : ''),
        fields: changes,
      });
    }
  }

  if (intent === 'log_call' || extracted?.call_outcome || extracted?.note) {
    actions.push({
      type: 'log_activity',
      label: `Log call with ${who}`,
      fields: {
        activity_type: 'call',
        contact_id: target?.id || (candidates.length === 1 ? candidates[0].id : ''),
        contact_name: who,
        notes: [extracted?.call_outcome, extracted?.note].filter(Boolean).join(' — '),
        outcome: extracted?.call_outcome || '',
      },
    });
  }

  if (intent === 'create_task' || extracted?.follow_up_iso) {
    actions.push({
      type: 'create_task',
      label: `Create follow-up${extracted?.follow_up_phrase ? `: ${extracted.follow_up_phrase}` : ''}`,
      fields: {
        contact_id: target?.id || (candidates.length === 1 ? candidates[0].id : ''),
        contact_name: who,
        due_at: extracted?.follow_up_iso || '',
        note: extracted?.note || extracted?.requested_action || '',
      },
    });
  }

  if (extracted?.lookup_email || intent === 'lookup_email' || intent === 'find_prospect') {
    actions.push({
      type: 'lookup_email',
      label: `Look up a verified business email for ${subject || who}`,
      fields: {
        full_name: subject,
        company: extracted?.company || '',
        city: extracted?.city || '',
        state: extracted?.state || '',
      },
    });
  }

  return actions;
}

/**
 * Phone numbers are stored in whatever format they were first entered, so a
 * duplicate check cannot compare a single literal. This matches the last ten
 * digits with any separators, server-side, instead of scanning a page of rows
 * (which silently misses duplicates past the first page).
 */
export function phoneRegexSource(phone: any) {
  const d = digits(phone).slice(-10);
  if (d.length !== 10) return '';
  return `^\\+?1?[^0-9]*${d.slice(0, 3)}[^0-9]*${d.slice(3, 6)}[^0-9]*${d.slice(6)}`;
}

export async function findContactsByPhone(base44: any, phone: any) {
  const d = digits(phone).slice(-10);
  if (d.length !== 10) return [];
  // Phone numbers are stored in whatever format they were entered in, so try the
  // common spellings first, then fall back to a digit-tolerant pattern.
  const variants = [
    `+1${d}`,
    d,
    `1${d}`,
    `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
    `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
    `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`,
  ];
  try {
    const rows = listOf(
      await base44.asServiceRole.entities.Contact.filter({ phone: { $in: variants } }, { limit: 25 })
    );
    if (rows.length) return rows;
  } catch (error: any) {
    console.warn('[phone lookup] variant match failed:', error?.message);
  }
  const source = phoneRegexSource(phone);
  if (!source) return [];
  try {
    return listOf(
      await base44.asServiceRole.entities.Contact.filter({ phone: { $regex: source } }, { limit: 25 })
    );
  } catch (error: any) {
    console.warn('[phone lookup] pattern match failed:', error?.message);
    return [];
  }
}

async function uniqueContactByQuery(base44: any, query: any) {
  const rows = listOf(await base44.asServiceRole.entities.Contact.filter(query, { limit: 5 }).catch(() => []));
  return rows.length === 1 ? rows[0] : null;
}

function nameParts(extracted: any) {
  if (extracted?.first_name || extracted?.last_name) {
    return { firstname: extracted.first_name || '', lastname: extracted.last_name || '' };
  }
  const parts = String(extracted?.full_name || '').trim().split(/\s+/);
  return { firstname: parts[0] || '', lastname: parts.slice(1).join(' ') || '' };
}

/**
 * Apply an approved execution. Re-running returns the first result instead of
 * writing again (idempotent by execution id).
 */
export async function applyCommand(base44: any, execution: any, edits: any, member: any) {
  const extracted = { ...(execution.extracted || {}), ...(edits?.extracted || {}) };
  const intent = edits?.intent || execution.intent;
  const chosenContactId = edits?.contact_id || '';
  const repId = member?.id || execution.sales_member_id;
  const repEmail = member?.email || execution.user_email || '';
  const repName = member?.full_name || execution.user_name || '';
  const result: any = { contact_id: '', activity_id: '', task_id: '', lookup_requested: false, notes: [] };

  let contact: any = null;
  if (chosenContactId) {
    contact = await base44.asServiceRole.entities.Contact.get(chosenContactId).catch(() => null);
    if (!contact) throw new Error('That contact no longer exists.');
  }

  const wantsCreate = intent === 'create_prospect' && !contact;

  if (wantsCreate) {
    const phone = normalizePhone(extracted.phone);
    const email = String(extracted.email || '').toLowerCase().trim();
    let duplicate = null;
    if (phone) duplicate = (await findContactsByPhone(base44, phone))[0] || null;
    if (!duplicate && email) duplicate = await uniqueContactByQuery(base44, { email });
    if (duplicate) {
      result.notes.push(`${contactName(duplicate)} already exists with that phone or email — opened the existing record instead of creating a duplicate.`);
      contact = duplicate;
    } else {
      const names = nameParts(extracted);
      contact = await base44.asServiceRole.entities.Contact.create({
        firstname: names.firstname,
        lastname: names.lastname,
        email: email || undefined,
        phone: phone || undefined,
        company: extracted.company || undefined,
        billing_city: extracted.city || undefined,
        billing_state: extracted.state || undefined,
        lead_status: extracted.lead_status || 'NEW',
        owner_id: repId,
        sales_member_id: repId,
      });
      result.contact_id = contact.id;
      result.notes.push(`Created ${contactName(contact)}.`);
    }
  }

  if (!contact && (execution.candidates || []).length === 1 && ['update_prospect', 'log_call', 'create_task', 'update_status'].includes(intent)) {
    contact = await base44.asServiceRole.entities.Contact.get(execution.candidates[0].id).catch(() => null);
  }

  if (contact && !result.contact_id) result.contact_id = contact.id;

  // Contact detail changes, only for fields the user approved.
  if (contact && (intent === 'update_prospect' || intent === 'update_status' || edits?.fields)) {
    const fields: any = { ...(edits?.fields || {}) };
    for (const key of ['phone', 'email', 'company', 'billing_city', 'billing_state']) {
      if (extracted[key] && !fields[key]) fields[key] = extracted[key];
    }
    if (!fields.billing_city && extracted.city) fields.billing_city = extracted.city;
    if (!fields.billing_state && extracted.state) fields.billing_state = extracted.state;
    if (!fields.lead_status && extracted.lead_status) fields.lead_status = extracted.lead_status;
    if (extracted.phone) fields.phone = normalizePhone(fields.phone || extracted.phone);
    const writable: any = {};
    for (const key of ['phone', 'email', 'company', 'billing_city', 'billing_state', 'lead_status']) {
      if (fields[key]) writable[key] = fields[key];
    }
    if (Object.keys(writable).length) {
      await base44.asServiceRole.entities.Contact.update(contact.id, writable);
      result.notes.push(`Updated ${Object.keys(writable).join(', ')}.`);
    }
  }

  const who = contact ? contactName(contact) : extracted.full_name || 'this prospect';
  const contactEmail = contact?.email || String(extracted.email || '').toLowerCase() || '';

  if (intent === 'log_call' || extracted.call_outcome || extracted.note) {
    const notes = [extracted.call_outcome, extracted.note].filter(Boolean).join(' — ');
    if (notes) {
      const log = await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'call',
        contact_name: who,
        contact_email: contactEmail || undefined,
        company_name: contact?.company || extracted.company || undefined,
        activity_date: new Date().toISOString(),
        notes,
        direction: 'outgoing',
        missed: /no answer|missed|didn'?t answer|did not answer/i.test(extracted.call_outcome || ''),
        sales_member_id: repId,
        sales_member_email: repEmail,
      });
      result.activity_id = log.id;
      result.notes.push('Logged the call outcome.');
    }
  }

  const dueAt = extracted.follow_up_iso || edits?.fields?.due_at || '';
  if (intent === 'create_task' || dueAt) {
    const parsed = dueAt ? new Date(dueAt) : null;
    const due = parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : '';
    const taskNotes = `[AI Follow-Up]${due ? ` Due ${due}.` : ''} ${extracted.note || extracted.requested_action || ''}`.trim();
    const existing = listOf(
      await base44.asServiceRole.entities.ActivityLog.filter(
        { activity_type: 'task', sales_member_id: repId, contact_name: who },
        { sort: '-created_date', limit: 10 }
      ).catch(() => [])
    );
    const duplicateTask = existing.find(
      (t: any) => (t.notes || '').includes('[AI Follow-Up]') && due && (t.notes || '').includes(due)
    );
    if (!duplicateTask) {
      const task = await base44.asServiceRole.entities.ActivityLog.create({
        activity_type: 'task',
        contact_name: who,
        contact_email: contactEmail || undefined,
        company_name: contact?.company || extracted.company || undefined,
        activity_date: due || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        notes: taskNotes,
        direction: 'outgoing',
        sales_member_id: repId,
        sales_member_email: repEmail,
      });
      result.task_id = task.id;
      result.notes.push('Created the follow-up task.');
    } else {
      result.task_id = duplicateTask.id;
      result.notes.push('A follow-up for that date already exists — left it in place.');
    }
  }

  if (extracted.lookup_email || intent === 'lookup_email' || intent === 'find_prospect') {
    result.lookup_requested = true;
    result.lookup = {
      full_name: extracted.full_name || who,
      company: contact?.company || extracted.company || '',
      city: contact?.billing_city || extracted.city || '',
      state: contact?.billing_state || extracted.state || '',
      contact_id: result.contact_id,
    };
  }

  result.contact = contact
    ? { id: contact.id, name: contactName(contact), email: contact.email || '', phone: contact.phone || '' }
    : null;
  return result;
}