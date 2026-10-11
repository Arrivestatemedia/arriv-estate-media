// ============================================================================
// ARRIV AUTO-FUND — RENEWAL NOTICE POLICY (jurisdiction-aware)
// ============================================================================
// Renewal notices are resolved per jurisdiction rather than assumed identical
// everywhere. A monthly renewal does NOT automatically require its own separate
// advance reminder in every jurisdiction, so the cadence is a DATA DECISION, not
// a hardcoded assumption.
//
// Every rule below is a CONSERVATIVE INTERNAL DEFAULT with
// `statutory_cadence_confirmed: false`. No rule here is a legal determination:
// the lead times must be confirmed by counsel per state before enrollment opens.
// Setting a lead time here does NOT claim statutory compliance.
// ============================================================================

export interface RenewalNoticeRule {
  /** Rule identifier recorded on every notice for audit. */
  rule_id: string;
  /** Jurisdiction this rule applies to ('DEFAULT' when none is resolved). */
  state: string;
  /** How many days before a renewal the notice should go out. */
  advance_notice_days: number;
  /** When false, a renewal notice is not required for each individual renewal. */
  notice_each_renewal: boolean;
  /** Plain-language basis/status for this rule — always pending counsel. */
  basis: string;
  /** False until counsel confirms the statutory cadence for this jurisdiction. */
  statutory_cadence_confirmed: boolean;
}

/**
 * Conservative defaults. Long-lead states are given the wider window so a notice
 * is never sent LATER than a statute could require; sending earlier is the safe
 * direction. Cadence confirmation is outstanding for every entry.
 */
export const AUTOFUND_RENEWAL_RULES: Record<string, RenewalNoticeRule> = {
  DEFAULT: {
    rule_id: 'DEFAULT_7D',
    state: 'DEFAULT',
    advance_notice_days: 7,
    notice_each_renewal: true,
    basis: 'Conservative internal default pending counsel confirmation of the applicable cadence.',
    statutory_cadence_confirmed: false,
  },
  GA: {
    rule_id: 'GA_30D',
    state: 'GA',
    advance_notice_days: 30,
    notice_each_renewal: true,
    basis: 'Georgia O.C.G.A. § 10-1-439.9 review target — cadence to be confirmed by counsel.',
    statutory_cadence_confirmed: false,
  },
  MD: {
    rule_id: 'MD_30D',
    state: 'MD',
    advance_notice_days: 30,
    notice_each_renewal: true,
    basis: 'Maryland Commercial Law § 14-1329 review target — cadence to be confirmed by counsel.',
    statutory_cadence_confirmed: false,
  },
};

/** Resolve the rule for a state, falling back to the conservative default. */
export function resolveRenewalNoticeRule(state?: string | null): RenewalNoticeRule {
  const key = (state || '').toUpperCase().trim();
  return AUTOFUND_RENEWAL_RULES[key] || AUTOFUND_RENEWAL_RULES.DEFAULT;
}

/**
 * Stable per-cycle key so one renewal can only ever produce one notice.
 * Derived from the renewal date itself, so a re-run of the scheduler, a retry,
 * or two schedulers racing cannot send the same reminder twice.
 */
export function renewalCycleKey(subscriptionId: string, renewalDateIso: string): string {
  const day = (renewalDateIso || '').slice(0, 10);
  return `${subscriptionId}_${day}`;
}

export interface RenewalDueInput {
  /** ISO date of the next renewal. */
  next_billing_date?: string;
  /** Current subscription status. */
  status?: string;
  /** Subscription is only eligible while actively billing. */
  auto_charge_paused?: boolean;
  recovery_hold_active?: boolean;
}

export interface RenewalDueResult {
  due: boolean;
  reason: string;
  rule: RenewalNoticeRule;
  renewal_date: string;
  notice_due_date: string;
}

/**
 * Whether a renewal notice should be sent for this subscription NOW.
 *
 * A notice becomes due once the current time has reached
 * (renewal date − advance lead time). It stays due until the renewal passes, so
 * a scheduler that misses a run still sends before the renewal rather than
 * silently skipping the notice.
 *
 * Not eligible when the subscription is cancelled or paused, or when a payment
 * failure has placed the account on a recovery hold — those customers are handled
 * by the recovery notification flow instead.
 */
export function isRenewalNoticeDue(sub: RenewalDueInput, now: Date = new Date()): RenewalDueResult {
  const rule = resolveRenewalNoticeRule((sub as any)?.jurisdiction_state);
  const renewalIso = sub?.next_billing_date || '';
  const base: RenewalDueResult = {
    due: false,
    reason: '',
    rule,
    renewal_date: renewalIso,
    notice_due_date: '',
  };

  if (!renewalIso) return { ...base, reason: 'No next billing date on the subscription.' };
  if (sub?.status !== 'active') return { ...base, reason: `Subscription is ${sub?.status || 'not active'} — no renewal notice.` };
  if (sub?.auto_charge_paused) return { ...base, reason: 'Automatic charging is paused — handled by the recovery flow.' };
  if (sub?.recovery_hold_active) return { ...base, reason: 'A recovery hold is active — handled by the recovery flow.' };

  const renewal = new Date(renewalIso);
  if (Number.isNaN(renewal.getTime())) return { ...base, reason: 'Invalid next billing date.' };

  const dueFrom = new Date(renewal.getTime() - rule.advance_notice_days * 24 * 60 * 60 * 1000);

  // A renewal that is already in the past is stale — the cycle has moved on.
  if (renewal.getTime() <= now.getTime()) {
    return { ...base, reason: 'The renewal date has already passed.', notice_due_date: dueFrom.toISOString() };
  }
  if (now.getTime() < dueFrom.getTime()) {
    return { ...base, reason: `Not yet due — opens ${dueFrom.toISOString()}.`, notice_due_date: dueFrom.toISOString() };
  }

  return {
    due: true,
    reason: 'Renewal notice is due before the upcoming renewal.',
    rule,
    renewal_date: renewalIso,
    notice_due_date: dueFrom.toISOString(),
  };
}

/** Jurisdictions whose cadence still requires counsel confirmation. */
export function unconfirmedJurisdictions(): string[] {
  return Object.values(AUTOFUND_RENEWAL_RULES)
    .filter(r => !r.statutory_cadence_confirmed)
    .map(r => r.state);
}