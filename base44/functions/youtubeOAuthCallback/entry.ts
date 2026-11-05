import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { exchangeCodeForTokens, fetchChannelInfo, isYoutubeConfigured } from '../../shared/youtubeClient.ts';
import { resolveAppUrl } from '../../shared/mlsNotifications.ts';

/**
 * youtubeOAuthCallback
 * Returns from Google's consent screen and stores Arriv's channel authorization.
 *
 * The state parameter is HMAC-signed by manageYoutubeConnection with the OAuth client secret and
 * carries a timestamp, so a callback can only complete a flow that an administrator started in
 * this app, and only within 20 minutes. The refresh token is stored on an admin-only record
 * (YouTubeChannelConnection, row-level security: admin) and is never returned to a client.
 */
async function verifyState(state: string): Promise<boolean> {
  const parts = String(state || '').split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;

  const key = Deno.env.get('YOUTUBE_CLIENT_SECRET') || '';
  if (!key) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch !== 0) return false;

  const issuedAt = Number(payload.split(':')[1]);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < 20 * 60 * 1000;
}

function redirectTo(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let appUrl = 'https://app.arrivestatemedia.com';
  try { appUrl = await resolveAppUrl(base44); } catch { /* documented fallback */ }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const error = url.searchParams.get('error');

    if (error) {
      return redirectTo(`${appUrl}/AdminSettings?youtube=denied`);
    }
    if (!code) return redirectTo(`${appUrl}/AdminSettings?youtube=missing_code`);
    if (!isYoutubeConfigured()) return redirectTo(`${appUrl}/AdminSettings?youtube=not_configured`);
    if (!(await verifyState(state))) return redirectTo(`${appUrl}/AdminSettings?youtube=bad_state`);

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens?.refresh_token) {
      // Without a refresh token the connection would die within the hour — refuse it rather than
      // storing a credential that silently stops working.
      return redirectTo(`${appUrl}/AdminSettings?youtube=no_refresh_token`);
    }

    const info = await fetchChannelInfo(tokens.access_token);

    const existing = await base44.asServiceRole.entities.YouTubeChannelConnection.list('-created_date', 5);
    const payload = {
      channel_title: info?.title || 'Arriv channel',
      channel_id: info?.id || '',
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      refresh_token: tokens.refresh_token,
      scope: tokens.scope || '',
      status: 'connected',
      connected_at: new Date().toISOString(),
      connected_by: state.split(':')[2] || 'admin',
      last_error: '',
    };

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.YouTubeChannelConnection.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.YouTubeChannelConnection.create(payload);
    }

    return redirectTo(`${appUrl}/AdminSettings?youtube=connected`);
  } catch (err: any) {
    console.error('youtubeOAuthCallback error:', err?.message || err);
    return redirectTo(`${appUrl}/AdminSettings?youtube=error`);
  }
});