import { base44 } from '@/api/base44Client';

// Primary host first, then Twilio's own CDN in case the first one is blocked.
const SDK_URLS = [
  'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js',
  'https://media.twiliocdn.com/sdk/js/voice/releases/2.10.0/twilio.min.js'
];

// Loads the Twilio Voice SDK once, however many dialers ask for it.
export const loadTwilioSdk = () => new Promise((resolve, reject) => {
  if (window.Twilio?.Device) { resolve(); return; }
  const existing = document.getElementById('twilio-sdk-script');
  if (existing) {
    existing.addEventListener('load', resolve);
    existing.addEventListener('error', () => reject(new Error('Unable to load Twilio SDK')));
    return;
  }
  const attempt = (index) => {
    if (index >= SDK_URLS.length) {
      reject(new Error('Unable to load Twilio SDK. This may be blocked by a browser extension or firewall.'));
      return;
    }
    const script = document.createElement('script');
    script.id = 'twilio-sdk-script';
    script.src = SDK_URLS[index];
    script.onload = resolve;
    script.onerror = () => { script.remove(); attempt(index + 1); };
    document.head.appendChild(script);
  };
  attempt(0);
});

// 20101 = AccessTokenInvalid: Twilio rejected the calling token.
const isTokenError = (err) => err?.code === 20101 || /AccessTokenInvalid/i.test(err?.message || err?.description || '');

const fetchToken = async (salesMemberId) => {
  const res = await base44.functions.invoke('generateTwilioToken', {
    salesMemberId,
    salesMemberEmail: localStorage.getItem('sales_member_email')
  });
  return res?.data || {};
};

/**
 * Creates and registers a Twilio Voice Device that keeps its own access token alive.
 *
 * A Twilio access token is only valid for one hour. Without replacing it, any dialer
 * left open — a phone sitting on the Recents screen, a backgrounded tab — keeps trying
 * to register with the token it was built with and starts failing with
 * AccessTokenInvalid (20101). This issues a fresh token before the current one
 * expires, after a token error, and when the screen wakes up without a live
 * registration, so the rep never has to reload.
 *
 * Returns { device, identity, refresh, destroy }. Always call destroy() on unmount.
 */
export const createVoiceDevice = async ({ salesMemberId, options = {}, handlers = {} }) => {
  await loadTwilioSdk();

  const { token, identity } = await fetchToken(salesMemberId);
  if (!token) throw new Error('Failed to get access token');

  const { Device } = window.Twilio;
  const device = new Device(token, {
    codecPreferences: ['opus', 'pcmu'],
    enableRingingState: true,
    ...options
  });

  let refreshing = false;
  const refresh = async () => {
    if (refreshing || device.state === 'destroyed') return;
    refreshing = true;
    try {
      const { token: fresh } = await fetchToken(salesMemberId);
      if (!fresh) return;
      device.updateToken(fresh);
      if (device.state === 'unregistered') await device.register();
      handlers.onRegistered?.(identity);
    } catch (err) {
      console.error('[Twilio] Access token refresh failed:', err);
      handlers.onRefreshFailed?.(err);
    } finally {
      refreshing = false;
    }
  };

  device.on('registered', () => handlers.onRegistered?.(identity));
  // Fires shortly before the one-hour token expires.
  device.on('tokenWillExpire', () => refresh());
  device.on('error', (err) => {
    console.error('[Twilio] Device error:', err);
    if (isTokenError(err)) { refresh(); return; }
    handlers.onError?.(err);
  });
  if (handlers.onIncoming) device.on('incoming', handlers.onIncoming);

  try {
    await device.register();
  } catch (err) {
    // The token can expire between issuing and registering if the tab slept.
    if (isTokenError(err)) await refresh();
    else throw err;
  }

  // iOS and Safari drop the connection while the phone is locked.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && device.state === 'unregistered') refresh();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    device,
    identity,
    refresh,
    destroy: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      try { device.destroy(); } catch (e) { /* already gone */ }
    }
  };
};