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

const REDIRECT_GUARD_KEY = 'customer_session_redirect_at';
const REDIRECT_GUARD_MS = 15000;

/**
 * True only when a request was refused because the CUSTOMER SESSION itself is gone:
 * expired, revoked, or minted for an account that no longer exists. A plain 401
 * (for example a platform-only endpoint refusing a customer) is not this, and must
 * never send anybody back to sign-in.
 */
export function isSessionFailure(error) {
  const status = error?.response?.status || error?.status;
  if (status !== 401) return false;
  const message = String(
    error?.response?.data?.error || error?.response?.data?.message || error?.message || '',
  );
  // Our session gate words its refusals: "A valid session is required…", "Your session has
  // ended…", "Your account could not be found…", and getJobRecords' bare "Not authorized."
  // (which also only ever means the caller had no resolvable session). Nothing else counts.
  return /session|sign in again|could not be found|^not authorized\.?$/i.test(message.trim());
}

/**
 * The session expired mid-session. Ask for ONE sign-in, on the existing sign-in
 * screen, and return the customer to the page they were on — never a redirect loop
 * back to the booking form. Returns true when a redirect was started.
 */
export function redirectIfSessionExpired(error) {
  if (!isSessionFailure(error)) return false;
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.toLowerCase().startsWith('/signin')) return false;

  // One attempt per window: if this page comes straight back without a new session,
  // show the inline message instead of redirecting forever.
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(REDIRECT_GUARD_KEY) || 0);
  } catch {
    last = 0;
  }
  if (last && Date.now() - last < REDIRECT_GUARD_MS) return false;
  try {
    sessionStorage.setItem(REDIRECT_GUARD_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }

  clearCustomerSession();
  // The stored identity is what makes the sign-in screen auto-forward an "already signed in"
  // person. Leaving it behind is exactly how a customer with a dead session was looped: page →
  // sign-in → auto-forward → page → refused again, without ever hitting a password field. Clearing
  // it means the one sign-in request is real, mints a fresh session, and the portal works.
  try {
    ['user_email', 'user_name', 'user_type', 'user_role', 'user_phone'].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch {
    /* storage unavailable */
  }
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/SignIn?redirect=${returnTo}`);
  return true;
}