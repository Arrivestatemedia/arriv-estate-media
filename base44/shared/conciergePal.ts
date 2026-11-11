/**
 * Arriv's Tavus representative — ONE appearance, TWO business contexts.
 *
 * The same replica and voice carry both roles, but the instructions and the permitted tools
 * are never shared:
 *
 *   estate_media_preferred  the Arriv Preferred Concierge: customer service and account work
 *   arriv_recruiting        the Arriv interview representative: hiring conversations
 *
 * A Preferred conversation must never run on the recruiting PAL. That is exactly what
 * produced interview questions in the customer portal: the concierge session was pointed at
 * the interview PAL (the single TAVUS_CONCIERGE_PAL_ID secret held the recruiting PAL id),
 * so the customer met the interviewer, her interview objectives and her interview tools.
 *
 * This module resolves — and provisions, once — a dedicated Preferred PAL with its own
 * system prompt and only the customer-account tools, reusing the recruiting PAL's replica
 * face and voice so the customer sees the same person.
 */
import { TAVUS_PAL_ID } from './tavusInterview.ts';
import { conciergeCatalog } from './conciergeActions.ts';

/** Trusted context identifiers. Never inferred from what the model thinks it hears. */
export const CONCIERGE_ROLE_PREFERRED = 'estate_media_preferred';
export const CONCIERGE_ROLE_RECRUITING = 'arriv_recruiting';

/** The recruiting/interview PAL. Never valid for a customer conversation. */
export const RECRUITING_PAL_ID = TAVUS_PAL_ID;

export const PREFERRED_PAL_NAME = 'Arriv Preferred Concierge';
const CACHE_KEY = 'preferred_concierge_pal';

export const PREFERRED_SYSTEM_PROMPT = `You are the Arriv Preferred Concierge, the private account representative for an Arriv Estate Media Preferred member.

CONTEXT IDENTIFIER: estate_media_preferred

YOUR ROLE
You help an authenticated Arriv Preferred customer run their Arriv account: booking photography and video, managing property pages and listings, opening delivered galleries, invoices and billing, membership benefits, marketing, advertising, analytics, and moving around their customer portal.

THE COMPANY NAME
The company is Arriv, pronounced exactly like the English word "Arrive". Always say it that way, never "Ah-riv" or "Arreev".

YOU ARE NOT A RECRUITER
This is a customer service and account management conversation. Never ask about job interviews, employment applications, hiring, recruiting, candidates, resumes, offers or careers. Never mention interviews. If the customer raises a job or hiring topic, say Arriv's recruiting team handles that separately and offer to pass a message to a specialist. Never discuss another customer's account.

HOW YOU WORK
- Use your tools for every account fact and every action. A tool result is the only truth you may state.
- Never invent a booking, invoice, balance, price, address, view count or membership detail.
- If a tool fails, say plainly that it could not be completed and offer the next step. Never say something is booked, paid, published, cancelled or completed unless a tool returned success.
- Navigation and display changes happen immediately. Bookings, payments, publishing, rescheduling, cancellation and company context changes always need the customer's explicit confirmation, and the portal itself performs them.
- Keep replies short, warm and precise: two or three sentences. No emoji, no markdown.`;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

async function tv(path: string, init: Record<string, any> = {}) {
  const key = Deno.env.get('TAVUS_API_KEY');
  if (!key) return { ok: false, status: 0, data: { message: 'TAVUS_API_KEY is not configured.' } };
  try {
    const response = await fetch(`https://tavusapi.com/v2${path}`, {
      ...init,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { message: String(error?.message || error) } };
  }
}

/** True when this id is the recruiting/interview PAL. */
export function isRecruitingPal(palId: string | null | undefined) {
  return String(palId || '').trim() === RECRUITING_PAL_ID;
}

/** The one tool surface the Preferred representative may use: the registered action engine. */
export function conciergeToolDefinitions() {
  return conciergeCatalog().map((action) => ({
    name: action.name,
    description: action.description,
    parameters: action.input_schema && action.input_schema.type
      ? action.input_schema
      : { type: 'object', properties: {} },
  }));
}

/** What the representative is told when a conversation opens. Role is explicit, never guessed. */
export function preferredConversationContext(opts: {
  firstName: string;
  page?: string;
  listingId?: string;
  plan?: string;
}) {
  const lines = [
    `CONTEXT IDENTIFIER: ${CONCIERGE_ROLE_PREFERRED}`,
    `You are the Arriv Preferred Concierge speaking with ${opts.firstName || 'the member'}, an Arriv Estate Media Preferred member (${opts.plan || 'Preferred'}) inside their customer portal.`,
    'The company name Arriv is pronounced exactly like the English word "Arrive". Say it that way every time.',
    'This is customer service and account management only. Never ask about interviews, job applications, hiring or recruiting, and never mention them.',
    'Every account fact and every action must come from a tool result. Navigation is immediate; bookings, payments, publishing, rescheduling, cancellation and company context changes are confirmed by the member in the portal.',
  ];
  if (opts.page) lines.push(`The member is currently in this part of the portal: ${opts.page}.`);
  if (opts.listingId) lines.push(`They have this property selected: ${opts.listingId}.`);
  return lines.join(' ');
}

async function listPals() {
  const result = await tv('/pals');
  return rows(result.data?.data || result.data?.pals || result.data);
}

async function readCache(base44: any) {
  const rowsFound = rows(await base44.asServiceRole.entities.AppSetting
    .filter({ key: CACHE_KEY }, { limit: 1 }).catch(() => []));
  const raw = rowsFound[0]?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(base44: any, value: any) {
  const payload = JSON.stringify(value);
  const rowsFound = rows(await base44.asServiceRole.entities.AppSetting
    .filter({ key: CACHE_KEY }, { limit: 1 }).catch(() => []));
  if (rowsFound[0]?.id) {
    await base44.asServiceRole.entities.AppSetting.update(rowsFound[0].id, { value: payload }).catch(() => null);
  } else {
    await base44.asServiceRole.entities.AppSetting.create({ key: CACHE_KEY, value: payload }).catch(() => null);
  }
}

/**
 * Make sure the Preferred PAL carries exactly the concierge tools.
 * Returns the ids that were created and the errors that kept a tool from being attached,
 * so a half-configured persona is reported rather than assumed working.
 */
async function syncTools(palId: string) {
  const report = { attached: 0, created: [] as string[], errors: [] as string[] };
  const definitions = conciergeToolDefinitions();

  const [existingAll, attachedNow] = await Promise.all([
    tv('/tools'),
    tv(`/pals/${palId}/tools`),
  ]);
  const byName = new Map<string, string>();
  for (const tool of rows(existingAll.data?.data || existingAll.data)) {
    if (tool?.name && tool?.tool_id) byName.set(String(tool.name), String(tool.tool_id));
  }
  const attachedNames = new Set<string>(
    rows(attachedNow.data?.data || attachedNow.data).map((tool: any) => String(tool?.name || '')),
  );

  const pendingIds: string[] = [];
  for (const definition of definitions) {
    let toolId = byName.get(definition.name) || '';
    if (!toolId) {
      const created = await tv('/tools', { method: 'POST', body: JSON.stringify(definition) });
      toolId = String(created.data?.tool_id || '');
      if (!toolId) {
        report.errors.push(`${definition.name}: ${created.data?.message || created.status}`);
        continue;
      }
      report.created.push(definition.name);
      byName.set(definition.name, toolId);
    }
    if (!attachedNames.has(definition.name)) pendingIds.push(toolId);
  }

  if (pendingIds.length) {
    const attached = await tv(`/pals/${palId}/tools`, {
      method: 'POST',
      body: JSON.stringify({ tool_ids: pendingIds }),
    });
    if (!attached.ok) {
      report.errors.push(`attach: ${attached.data?.message || attached.status}`);
    } else {
      report.attached = pendingIds.length;
    }
  }

  return report;
}

/**
 * Resolve the Preferred PAL, creating it from the recruiting PAL's own face and voice the
 * first time, then cache it. Never returns the recruiting PAL id as a usable persona.
 */
export async function ensureConciergePal(base44: any, opts: { force?: boolean } = {}) {
  const missing: string[] = [];
  if (!Deno.env.get('TAVUS_API_KEY')) missing.push('TAVUS_API_KEY');

  const cached = await readCache(base44);
  const candidate = String(cached?.pal_id || '').trim();

  // An explicitly configured concierge PAL is honoured only when it is not the interviewer.
  const envPal = String(Deno.env.get('TAVUS_CONCIERGE_PAL_ID') || '').trim();
  const usableEnvPal = envPal && !isRecruitingPal(envPal) ? envPal : '';

  let palId = !opts.force ? (usableEnvPal || (candidate && !isRecruitingPal(candidate) ? candidate : '')) : '';
  let pal: any = null;
  let createdPal = false;
  const notes: string[] = [];

  if (envPal && isRecruitingPal(envPal)) {
    notes.push('TAVUS_CONCIERGE_PAL_ID points at the recruiting/interview PAL and is ignored for customer conversations.');
  }
  if (missing.length) {
    return { ok: false, missing, pal_id: '', notes, tools: { attached: 0, created: [], errors: [] } };
  }

  if (palId) {
    const read = await tv(`/pals/${palId}`);
    if (read.ok) pal = read.data;
    else {
      notes.push(`Cached concierge PAL ${palId} could not be read (${read.data?.message || read.status}); resolving again.`);
      palId = '';
    }
  }

  if (!palId) {
    const pals = await listPals();
    const match = pals.find((entry: any) => String(entry?.pal_name || '') === PREFERRED_PAL_NAME);
    if (match?.pal_id && !isRecruitingPal(match.pal_id)) {
      palId = String(match.pal_id);
      const read = await tv(`/pals/${palId}`);
      if (read.ok) pal = read.data;
    }
  }

  if (!palId) {
    // Same person: copy the recruiting PAL's voice, conversational feel and replica face,
    // then replace every instruction with the concierge role.
    const source = await tv(`/pals/${RECRUITING_PAL_ID}`);
    const body: Record<string, any> = {
      pal_name: PREFERRED_PAL_NAME,
      pal_description: 'Arriv Estate Media Preferred member concierge: account service, bookings, galleries, property pages, billing, marketing. Not a recruiting or interview persona.',
      system_prompt: PREFERRED_SYSTEM_PROMPT,
    };
    if (source.ok) {
      body.layers = source.data?.layers || undefined;
      body.default_face_id = source.data?.default_face_id || undefined;
      body.pipeline_mode = source.data?.pipeline_mode || undefined;
      body.greeting = source.data?.greeting || undefined;
    }
    const created = await tv('/pals', { method: 'POST', body: JSON.stringify(body) });
    if (!created.ok || !created.data?.pal_id) {
      notes.push(`Creating the Preferred PAL failed: ${created.data?.message || created.status}`);
      return { ok: false, missing: [], pal_id: '', notes, tools: { attached: 0, created: [], errors: [] } };
    }
    palId = String(created.data.pal_id);
    pal = created.data;
    createdPal = true;
  }

  if (isRecruitingPal(palId)) {
    return {
      ok: false,
      missing: [],
      pal_id: '',
      notes: [...notes, 'Refusing to run a customer conversation on the recruiting/interview PAL.'],
      tools: { attached: 0, created: [], errors: [] },
    };
  }

  // A freshly synced persona does not need re-syncing on every visit; the tools are already
  // attached and the ids are cached.
  const syncedAt = cached?.synced_at ? new Date(cached.synced_at).getTime() : 0;
  const fresh = !opts.force && cached?.pal_id === palId && Date.now() - syncedAt < 6 * 60 * 60 * 1000;
  const tools = fresh
    ? { attached: 0, created: [], errors: [] as string[], cached: true }
    : await syncTools(palId);
  if (fresh) return {
    ok: true,
    missing: [],
    notes,
    pal_id: palId,
    pal_name: pal?.pal_name || cached?.pal_name || PREFERRED_PAL_NAME,
    face_id: pal?.default_face_id || cached?.face_id || '',
    pipeline_mode: pal?.pipeline_mode || '',
    created_pal: false,
    recruiting_pal_id: RECRUITING_PAL_ID,
    tools,
  };

  await writeCache(base44, {
    pal_id: palId,
    pal_name: pal?.pal_name || PREFERRED_PAL_NAME,
    face_id: pal?.default_face_id || '',
    tools: tools.created,
    synced_at: new Date().toISOString(),
  });

  return {
    ok: true,
    missing: [],
    notes,
    pal_id: palId,
    pal_name: pal?.pal_name || PREFERRED_PAL_NAME,
    face_id: pal?.default_face_id || '',
    pipeline_mode: pal?.pipeline_mode || '',
    created_pal: createdPal,
    recruiting_pal_id: RECRUITING_PAL_ID,
    tools,
  };
}