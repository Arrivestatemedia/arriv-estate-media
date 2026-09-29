import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';
import { buildQuote, QuoteInput } from '../../shared/b2bQuoteEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const input: QuoteInput = await req.json();

    const lockedSnapshots = await buildLockedConfigSnapshots(base44.asServiceRole);
    const quote = buildQuote(lockedSnapshots, input);

    return Response.json({ status: 'OK', data: quote });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});