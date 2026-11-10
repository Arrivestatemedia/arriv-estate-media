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
export function getSalesSessionToken() {
  try {
    return localStorage.getItem('sales_session_token') || sessionStorage.getItem('sales_session_token') || null;
  } catch {
    return null;
  }
}

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

/**
 * A protected call was refused because there is no valid session (for example a
 * customer who signed in before sessions existed, or an expired 30-day session).
 * Send them to the existing sign-in screen to get a fresh one — this is a re-login,
 * never a bypass. Returns true when a redirect was started.
 */
export function redirectIfSessionExpired(error) {
  const message = String(error?.message || error?.response?.data?.error || '');
  const status = error?.response?.status || error?.status;
  if (status !== 401 && !/session/i.test(message)) return false;
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.toLowerCase().startsWith('/signin')) return false;
  window.location.replace('/SignIn');
  return true;
}