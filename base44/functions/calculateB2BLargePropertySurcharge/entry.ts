import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';
import { calculateB2BLargePropertySurcharge as calcSurcharge } from '../../shared/b2bCreditCostResolver.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, body.contract_version_id);
    const result = calcSurcharge(lockedSnapshots, body.package, body.property_sqft);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});