/**
 * Client-side holder for the customer session token issued by verifySignIn.
 *
 * This is NOT a new login. The existing custom login is unchanged; the token is
 * simply kept alongside the existing localStorage/sessionStorage user keys
 * (Safari ITP fallback pattern already used across the app) and attached to the
 * backend calls that require it. It carries no role authority the server trusts:
 * every function re-derives identity and ownership from its own record.
 */

const TOKEN_KEY = 'customer_session_token';
const EXPIRES_KEY = 'customer_session_expires_at';

function readStored(key) {
  for (const name of ['localStorage', 'sessionStorage']) {
    try { const value = window[name].getItem(key); if (value) return value; } catch { /* try the other store */ }
  }
  return null;
}

export function storeCustomerValue(key, value) {
  let saved = false;
  for (const name of ['localStorage', 'sessionStorage']) {
    try { window[name].setItem(key, String(value ?? '')); saved = true; } catch { /* independent fallback */ }
  }
  return saved;
}

function removeStored(key) {
  for (const name of ['localStorage', 'sessionStorage']) {
    try { window[name].removeItem(key); } catch { /* independent fallback */ }
  }
}

export function saveCustomerSession(response) {
  const token = response?.session_token || response?.token;
  if (!token) return false;
  const saved = storeCustomerValue(TOKEN_KEY, token);
  const expiry = response.session_expires_at || response.expires_at;
  if (expiry) storeCustomerValue(EXPIRES_KEY, expiry);
  removeStored('customer_session_redirect_at');
  return saved;
}

export function getCustomerSessionToken() { return readStored(TOKEN_KEY); }
export function getCustomerSessionExpiry() { return readStored(EXPIRES_KEY); }
export function clearCustomerSession() {
  [TOKEN_KEY, EXPIRES_KEY].forEach(removeStored);
}

export function saveCustomerIdentity(account) {
  Object.entries({ user_email: account.email, user_name: account.full_name,
    user_type: account.user_type === 'media_partner' ? 'media_partner' : 'client',
    user_role: account.user_role || account.role || 'user', user_phone: account.phone_number,
  }).forEach(([key, value]) => storeCustomerValue(key, value));
}

/** The sales-team bridge token, when the browser holds one. */
export function getSalesSessionToken() { return readStored('sales_session_token'); }

/**
 * Merge the verified session credentials this browser holds into a payload.
 * A customer/contractor sends their customer session; a sales representative
 * (who may have no platform account) sends the token minted by the existing
 * sales login. The server checks them independently and never mixes the two.
 */
export function withCustomerSession(payload = {}) {
  const customer = getCustomerSessionToken();
  const sales = getSalesSessionToken();
  return {
    ...payload,
    ...(customer ? { session_token: customer } : {}),
    ...(sales ? { sales_session_token: sales } : {}),
  };
}

let validateSession;
let checkingToken;
export function setCustomerSessionValidator(validator) { validateSession = validator; }

// SDK errors may expose status/data directly, not as an Axios response.
export function isSessionFailure(error) {
  return Number(error?.response?.status || error?.status) === 401;
}
export function isConfirmedSessionFailure(error) {
  const data = error?.response?.data || error?.data;
  return isSessionFailure(error) && ['CUSTOMER_SESSION_INVALID', 'CUSTOMER_SESSION_REVOKED'].includes(data?.code);
}

export function redirectIfSessionExpired(error) {
  if (!isSessionFailure(error) || !validateSession || typeof window === 'undefined') return false;
  const token = getCustomerSessionToken();
  if (!token || checkingToken === token || window.location.pathname.toLowerCase().startsWith('/signin')) return false;
  checkingToken = token;
  // The failed service never decides whether to log out. Independently check this
  // exact credential; a late failure must not clear a newer login in another tab.
  validateSession(token).catch((validationError) => {
    if (!isConfirmedSessionFailure(validationError) || getCustomerSessionToken() !== token) return;
    clearCustomerSession();
    ['user_email', 'user_name', 'user_type', 'user_role', 'user_phone'].forEach(removeStored);
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/SignIn?redirect=${returnTo}`);
  }).finally(() => { if (checkingToken === token) checkingToken = null; });
  return false;
}