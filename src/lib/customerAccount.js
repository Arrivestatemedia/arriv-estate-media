import { base44 } from '@/api/base44Client';
import { getCustomerSessionToken, saveCustomerIdentity } from '@/lib/customerSession';

let pending = null;
let pendingToken = null;

// One server identity source for portal initialization. No optional-service reads,
// no email fallback, no long-lived browser cache of server authorization.
export function loadCustomerAccount() {
  const token = getCustomerSessionToken();
  if (pending && pendingToken === token) return pending;
  pendingToken = token;
  const request = base44.functions.invoke('getMyAccount', {
    session_token: token || '', identity_only: true,
  }).then(({ data }) => {
    if (!data?.ok || !data.account?.email) throw new Error('Could not load your account. Please retry.');
    if (getCustomerSessionToken() === token) saveCustomerIdentity(data.account);
    return data.account;
  }).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}