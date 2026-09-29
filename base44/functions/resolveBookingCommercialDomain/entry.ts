import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_id, email, organization_id } = await req.json();

    const entitlementRes = await base44.asServiceRole.functions.invoke('resolveB2BEntitlement', {
      user_id, email, organization_id,
    });
    const entitlement = entitlementRes?.data || entitlementRes;

    const domain = entitlement?.commercial_domain === 'B2B' ? 'B2B' : 'RETAIL';

    return Response.json({
      status: 'OK',
      commercial_domain: domain,
      entitlement,
      can_book: entitlement?.can_book ?? true,
      account_hold: entitlement?.account_hold ?? false,
      hold_reason: entitlement?.hold_reason || null,
      reason_if_cannot_book: entitlement?.reason_if_cannot_book || null,
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});