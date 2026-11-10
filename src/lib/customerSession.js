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

/** Merge the session token into a function payload. */
export function withCustomerSession(payload = {}) {
  const token = getCustomerSessionToken();
  return token ? { ...payload, session_token: token } : { ...payload };
}