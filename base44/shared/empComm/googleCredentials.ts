/**
 * Dedicated Google OAuth client for the employee communications layer
 * (employee Gmail + Google Calendar in the Email Hub).
 *
 * These credentials are deliberately SEPARATE from VITE_GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET, which stay in use for YouTube, Drive, Maps and the
 * legacy per-rep Gmail connection. Rotating one client therefore never
 * disturbs the other, and this connection is never granted by accident to a
 * consumer Google account outside the company Workspace.
 */

/** The one redirect URI registered on the Arriv One employee OAuth client. */
export const EMP_COMM_GOOGLE_REDIRECT_URI = 'https://app.arrivestatemedia.com/SalesRepGmailAuthCallback';

/**
 * Secrets pasted into the dashboard often carry a trailing line break, which
 * makes Google reject the whole client ("The OAuth client was not found").
 * Both values are single tokens, so all whitespace is stripped.
 */
function readSecret(name: string) {
  return (Deno.env.get(name) || '').replace(/\s+/g, '');
}

export function googleEmployeeCredentials() {
  const clientId = readSecret('ARRIV_ONE_GOOGLE_CLIENT_ID');
  const clientSecret = readSecret('ARRIV_ONE_GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Employee Google sign-in is not configured yet: ARRIV_ONE_GOOGLE_CLIENT_ID and ARRIV_ONE_GOOGLE_CLIENT_SECRET must be set.'
    );
  }
  return { clientId, clientSecret };
}

/** Configuration readiness only. Never returns the client secret. */
export function googleEmployeeCredentialStatus() {
  const clientId = readSecret('ARRIV_ONE_GOOGLE_CLIENT_ID');
  const clientSecret = readSecret('ARRIV_ONE_GOOGLE_CLIENT_SECRET');
  return {
    configured: Boolean(clientId && clientSecret),
    client_id_suffix: clientId ? clientId.slice(-20) : '',
    redirect_uri: EMP_COMM_GOOGLE_REDIRECT_URI,
  };
}