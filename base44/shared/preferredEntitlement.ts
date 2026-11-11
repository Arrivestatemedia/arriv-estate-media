/**
 * Arriv Preferred Concierge — entitlement resolution (server-side only).
 *
 * The concierge is gated on a real, paid Preferred entitlement. Nothing here can be
 * influenced by the browser or by the conversational model: the email comes from the
 * verified customer session, and the membership record is re-read on every request.
 *
 * Rules:
 *  - Only `active` / `trialing` memberships whose paid period has not ended count.
 *  - `cancel_at_period_end` keeps access until the period actually ends.
 *  - A membership whose plan is not a Preferred plan grants nothing. A higher-level
 *    plan includes Preferred only when an administrator explicitly lists it in
 *    AppSetting `preferred_entitled_plans`; buying Agent Presence / Growth /
 *    Brokerage never grants it.
 *  - Expiry removes premium access. It never deletes or alters customer records.
 */

import { customerEmailQuery } from './customerEmail.ts';

export const CONCIERGE_SWITCH_KEY = 'preferred_concierge';
export const ENTITLED_PLANS_KEY = 'preferred_entitled_plans';

export const DEFAULT_ENTITLED_PLANS = ['preferred_monthly', 'preferred_annual'];

export const PREFERRED_BENEFITS = [
  'Priority scheduling with senior photographers',
  'Preferred member pricing on every service',
  'Concierge service for bookings, galleries and billing',
  'Managed property marketing and promotion support',
];

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function settingValue(record: any): any {
  const raw = record?.value;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (!/^[[{]/.test(text)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function readConciergeSettings(base44: any) {
  const settings: any = { enabled: true, entitled_plans: [...DEFAULT_ENTITLED_PLANS], video_enabled: true };
  try {
    const found = rowsOf(await base44.asServiceRole.entities.AppSetting.filter(
      { key: { $in: [CONCIERGE_SWITCH_KEY, ENTITLED_PLANS_KEY] } },
    ));
    for (const record of found) {
      const value = settingValue(record);
      if (record.key === CONCIERGE_SWITCH_KEY) {
        if (value && typeof value === 'object') {
          settings.enabled = value.enabled !== false;
          settings.video_enabled = value.video_enabled !== false;
        } else if (value !== null) {
          settings.enabled = String(value) !== 'false';
        }
      }
      if (record.key === ENTITLED_PLANS_KEY && Array.isArray(value)) {
        const plans = value.map((item: any) => String(item).trim().toLowerCase()).filter(Boolean);
        if (plans.length) settings.entitled_plans = plans;
      }
    }
  } catch {
    // A settings read failure must not grant access; defaults above are the documented policy.
  }
  return settings;
}

export function inactive(reason: string, settings?: any) {
  return {
    active: false,
    reason,
    concierge_enabled: settings ? settings.enabled !== false : true,
    video_enabled: settings ? settings.video_enabled !== false : true,
    entitled_plans: settings?.entitled_plans || [...DEFAULT_ENTITLED_PLANS],
  };
}

function membershipIsLive(membership: any, entitledPlans: string[], now: number) {
  const status = String(membership?.status || '').toLowerCase();
  if (!['active', 'trialing'].includes(status)) return false;
  const plan = String(membership?.plan || '').trim().toLowerCase();
  if (!entitledPlans.includes(plan)) return false;
  const end = membership?.current_period_end ? new Date(membership.current_period_end).getTime() : null;
  if (Number.isFinite(end) && end !== null && end <= now) return false;
  return true;
}

/**
 * Resolve the signed-in customer's Preferred entitlement.
 * `email` and `accountId` MUST come from the verified customer session.
 */
export async function resolvePreferredEntitlement(base44: any, opts: { email: string; accountId?: string }) {
  const email = String(opts?.email || '').trim().toLowerCase();
  const settings = await readConciergeSettings(base44);

  if (!email) return inactive('no_session_email', settings);
  if (!settings.enabled) return inactive('feature_disabled', settings);

  const entity = base44.asServiceRole.entities.PreferredMembership;
  let memberships: any[] = [];
  if (opts.accountId) {
    memberships = rowsOf(await entity.filter({ client_id: String(opts.accountId) }).catch(() => []));
  }
  if (!memberships.length) {
    memberships = rowsOf(await entity.filter(customerEmailQuery('client_email', email)).catch(() => []));
  }

  // Only records that genuinely belong to this verified customer, whatever lookup branch matched.
  const owned = memberships.filter((membership: any) => {
    const sameEmail = String(membership?.client_email || '').trim().toLowerCase() === email;
    const sameAccount = opts.accountId ? String(membership?.client_id || '') === String(opts.accountId) : false;
    return sameEmail || sameAccount;
  });

  if (!owned.length) return inactive('no_membership', settings);

  const now = Date.now();
  const live = owned.filter((membership: any) => membershipIsLive(membership, settings.entitled_plans, now));
  if (!live.length) {
    const latest = owned
      .slice()
      .sort((a: any, b: any) => new Date(b?.current_period_end || 0).getTime() - new Date(a?.current_period_end || 0).getTime())[0];
    const ended = latest?.current_period_end && new Date(latest.current_period_end).getTime() <= now;
    return {
      ...inactive(ended ? 'membership_ended' : 'membership_inactive', settings),
      plan: latest?.plan || '',
      status: latest?.status || '',
      current_period_end: latest?.current_period_end || '',
    };
  }

  const chosen = live.sort((a: any, b: any) => {
    const rank = (record: any) => (String(record?.status || '').toLowerCase() === 'active' ? 2 : 1);
    const byStatus = rank(b) - rank(a);
    if (byStatus !== 0) return byStatus;
    return new Date(b?.current_period_end || 0).getTime() - new Date(a?.current_period_end || 0).getTime();
  })[0];

  return {
    active: true,
    reason: 'entitled',
    membership_id: chosen.id,
    plan: chosen.plan || 'preferred_monthly',
    status: String(chosen.status || '').toLowerCase(),
    monthly_price: Number(chosen.monthly_price || 0),
    started_at: chosen.started_at || '',
    current_period_end: chosen.current_period_end || '',
    cancel_at_period_end: chosen.cancel_at_period_end === true,
    entitled_plans: settings.entitled_plans,
    concierge_enabled: settings.enabled !== false,
    video_enabled: settings.video_enabled !== false,
    benefits: PREFERRED_BENEFITS,
    source: 'preferred_membership',
  };
}