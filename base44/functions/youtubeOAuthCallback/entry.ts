import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { verifyYoutubeOAuthState } from '../../shared/youtubeOAuthState.ts';
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
function redirectTo(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

export default async function(req) {
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
    const verifiedState = await verifyYoutubeOAuthState(state, secrets.get('YOUTUBE_CLIENT_SECRET'));
    if (!verifiedState) return redirectTo(`${appUrl}/AdminSettings?youtube=bad_state`);

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
      connected_by: verifiedState.actor,
      last_error: '',
    };

    if (existing && existing.length > 0) {
      await base44.asServiceRole.entities.YouTubeChannelConnection.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.YouTubeChannelConnection.create(payload);
    }

    return redirectTo(`${appUrl}/AdminSettings?youtube=connected`);
  } catch (err) {
    console.error('youtubeOAuthCallback error:', err?.message || err);
    return redirectTo(`${appUrl}/AdminSettings?youtube=error`);
  }
}