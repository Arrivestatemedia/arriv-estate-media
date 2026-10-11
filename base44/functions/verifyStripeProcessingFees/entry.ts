import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';

/**
 * VERIFY ACTUAL STRIPE PROCESSING FEES — read-only, admin-only.
 *
 * The Auto-Fund financial model assumes 2.9% + $0.30 per charge. That is a
 * published list rate, not an observed rate on this account. This function reads
 * the connected account's own settled balance transactions and derives the
 * effective rate and the effective fixed component from real settled charges, so
 * the assumption can be replaced by evidence.
 *
 * It also reports the real dispute count, which is the one chargeback input that
 * IS measurable on this account.
 *
 * Reads only. Creates, updates and deletes nothing.
 */

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const key = secrets.get('STRIPE_SECRET_KEY');
    if (!key) {
      return Response.json({ error: 'STRIPE_SECRET_KEY is not set for this app' }, { status: 400 });
    }
    const headers = { Authorization: `Bearer ${key}` };

    const [acct, charges, disputes] = await Promise.allSettled([
      fetch('https://api.stripe.com/v1/account', { headers, signal: AbortSignal.timeout(10000) }),
      fetch('https://api.stripe.com/v1/balance_transactions?limit=100&type=charge', { headers, signal: AbortSignal.timeout(15000) }),
      fetch('https://api.stripe.com/v1/disputes?limit=100', { headers, signal: AbortSignal.timeout(15000) })
    ]);

    const readJson = async (settled: PromiseSettledResult<Response>) =>
      settled.status === 'fulfilled' && settled.value.ok ? await settled.value.json() : null;
    const readError = async (settled: PromiseSettledResult<Response>) =>
      settled.status === 'rejected'
        ? String(settled.reason?.message ?? settled.reason)
        : (settled.value.ok ? null : `${settled.value.status}: ${(await settled.value.text()).slice(0, 300)}`);

    const account = await readJson(acct);
    const balancePage = await readJson(charges);
    const disputePage = await readJson(disputes);

    const accountInfo = account
      ? {
          account_id: account.id,
          country: account.country,
          default_currency: account.default_currency,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          business_type: account.business_type ?? null,
          livemode: account.livemode
        }
      : null;

    // Settled charges: gross, fee and net are integers in the smallest currency unit.
    const rows = (balancePage?.data ?? []).filter(
      (t: any) => t.type === 'charge' && typeof t.amount === 'number' && t.amount > 0
    );

    const currencies = [...new Set(rows.map((t: any) => t.currency))];
    const grossMinor = rows.reduce((s: number, t: any) => s + t.amount, 0);
    const feeMinor = rows.reduce((s: number, t: any) => s + (t.fee ?? 0), 0);
    const netMinor = rows.reduce((s: number, t: any) => s + (t.net ?? 0), 0);

    // Two-point solve for the account's own rate and fixed component:
    //   fee = rate * amount + fixed  =>  solved from the largest and smallest settled charge.
    const sorted = [...rows].sort((a: any, b: any) => a.amount - b.amount);
    let solved: any = null;
    if (sorted.length >= 2) {
      const lo = sorted[0];
      const hi = sorted[sorted.length - 1];
      const span = hi.amount - lo.amount;
      if (span > 0) {
        const rate = ((hi.fee ?? 0) - (lo.fee ?? 0)) / span;
        const fixed = (hi.fee ?? 0) - rate * hi.amount;
        solved = {
          derived_rate_pct: Number((rate * 100).toFixed(4)),
          derived_fixed_fee_minor: Number(fixed.toFixed(2)),
          derived_fixed_fee: Number((fixed / 100).toFixed(4)),
          solved_from_smallest_charge: { amount: lo.amount / 100, fee: (lo.fee ?? 0) / 100 },
          solved_from_largest_charge: { amount: hi.amount / 100, fee: (hi.fee ?? 0) / 100 }
        };
      }
    }

    const perCurrency = currencies.map(cur => {
      const subset = rows.filter((t: any) => t.currency === cur);
      const g = subset.reduce((s: number, t: any) => s + t.amount, 0);
      const f = subset.reduce((s: number, t: any) => s + (t.fee ?? 0), 0);
      const rates = subset.map((t: any) => (t.amount > 0 ? (t.fee ?? 0) / t.amount : 0));
      return {
        currency: cur,
        charge_count: subset.length,
        gross: Number((g / 100).toFixed(2)),
        fees: Number((f / 100).toFixed(2)),
        effective_rate_pct: g > 0 ? Number(((f / g) * 100).toFixed(4)) : null,
        lowest_single_charge_rate_pct: rates.length ? Number((Math.min(...rates) * 100).toFixed(4)) : null,
        highest_single_charge_rate_pct: rates.length ? Number((Math.max(...rates) * 100).toFixed(4)) : null
      };
    });

    const disputeRows = disputePage?.data ?? [];
    const disputeInfo = {
      dispute_count: disputeRows.length,
      disputed_amount_total: Number((disputeRows.reduce((s: number, d: any) => s + (d.amount ?? 0), 0) / 100).toFixed(2)),
      by_status: disputeRows.reduce((acc: Record<string, number>, d: any) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      }, {})
    };

    const hasEvidence = rows.length >= 2 && solved !== null;
    return Response.json({
      status: 'FEE_VERIFICATION_COMPLETE',
      read_only: true,
      account: accountInfo,
      account_error: await readError(acct),
      settled_charges_examined: rows.length,
      settled_charges_window_note:
        'The Stripe balance-transaction feed returns the most recent settled charges, up to 100. A wider window needs the dashboard or pagination.',
      totals: {
        gross: Number((grossMinor / 100).toFixed(2)),
        fees: Number((feeMinor / 100).toFixed(2)),
        net: Number((netMinor / 100).toFixed(2)),
        effective_rate_pct: grossMinor > 0 ? Number(((feeMinor / grossMinor) * 100).toFixed(4)) : null
      },
      derived_from_this_account: solved,
      by_currency: perCurrency,
      model_assumption_used: { rate_pct: 2.9, fixed_fee: 0.3 },
      model_assumption_supported_by_evidence: hasEvidence
        ? {
            rate_matches_within_0_1_pct_point:
              Math.abs(((solved.derived_rate_pct ?? 0) - 2.9)) <= 0.1,
            fixed_fee_matches_within_5_cents: Math.abs(((solved.derived_fixed_fee ?? 0) - 0.3)) <= 0.05
          }
        : null,
      disputes: disputeInfo,
      evidence_note: hasEvidence
        ? 'Derived from this account\'s own settled charges. Use these figures in place of the assumed 2.9% + $0.30.'
        : 'Insufficient settled charges to verify. 2.9% + $0.30 stays an ASSUMPTION until more charges settle.',
      charges_error: await readError(charges),
      disputes_error: await readError(disputes)
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}