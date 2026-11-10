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

export function saveCustomerSession(response) {
  if (!response || !response.session_token) return false;
  try {
    localStorage.setItem(TOKEN_KEY, response.session_token);
    sessionStorage.setItem(TOKEN_KEY, response.session_token);
    if (response.session_expires_at) {
      localStorage.setItem(EXPIRES_KEY, response.session_expires_at);
      sessionStorage.setItem(EXPIRES_KEY, response.session_expires_at);
    }
    return true;
  } catch {
    return false;
  }
}

export function getCustomerSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getCustomerSessionExpiry() {
  try {
    return localStorage.getItem(EXPIRES_KEY) || sessionStorage.getItem(EXPIRES_KEY) || null;
  } catch {
    return null;
  }
}

export function clearCustomerSession() {
  try {
    [TOKEN_KEY, EXPIRES_KEY].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {
    /* storage unavailable */
  }
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