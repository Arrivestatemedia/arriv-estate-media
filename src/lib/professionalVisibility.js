import { base44 } from '@/api/base44Client';

// Thin client for the Phase 4 visibility surfaces. Every call is answered by a backend function that
// decides what the caller may see; nothing here filters or decides authorization.

function unwrap(response) {
  return response?.data ?? response;
}

export async function fetchDirectory({ profileType = 'agent', q = '', state = '' } = {}) {
  const res = await base44.functions.invoke('getPublicProfessionalDirectory', { action: 'directory', profileType, q, state });
  return unwrap(res) || { profiles: [], total: 0 };
}

export async function fetchProfessionalProfile({ profileType, slug }) {
  const res = await base44.functions.invoke('getPublicProfessionalDirectory', { action: 'profile', profileType, slug });
  return unwrap(res) || { ok: false };
}

export async function fetchMarkets() {
  const res = await base44.functions.invoke('getPublicGeographicPage', { action: 'markets' });
  return unwrap(res) || { markets: [] };
}

export async function fetchMarket(slug) {
  const res = await base44.functions.invoke('getPublicGeographicPage', { action: 'market', slug });
  return unwrap(res) || { ok: false };
}

// The app signs people in with its own session (a customer's address, or the sales console's staff
// record). These calls tell the backend which of those it is, so ownership and administrator access are
// decided from the account that is actually signed in here. The server still compares the address
// against the record's own owner before allowing anything.
function sessionIdentity() {
  const read = (key) => {
    try {
      return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };
  const email = (read('user_email') || read('sales_member_email') || '').trim().toLowerCase();
  const salesMemberId = read('sales_member_id');
  const identity = {};
  if (email) {
    identity.email = email;
    identity.admin_email = email;
  }
  if (salesMemberId) identity.sales_member_id = salesMemberId;
  return identity;
}

export async function fetchVisibilityDashboard(profileId) {
  const res = await base44.functions.invoke('getVisibilityDashboard', {
    ...sessionIdentity(),
    ...(profileId ? { profileId } : {}),
  });
  return unwrap(res) || { profile: null };
}

export async function fetchSubscriptionOverview(profileId) {
  const res = await base44.functions.invoke('manageVisibilitySubscription', {
    ...sessionIdentity(),
    action: 'overview',
    profileId,
  });
  return unwrap(res);
}

export async function subscriptionAction(action, payload = {}) {
  const res = await base44.functions.invoke('manageVisibilitySubscription', {
    ...sessionIdentity(),
    action,
    ...payload,
  });
  return unwrap(res);
}

export async function profileAction(action, payload = {}) {
  const res = await base44.functions.invoke('manageProfessionalProfile', {
    ...sessionIdentity(),
    action,
    ...payload,
  });
  return unwrap(res);
}

export async function submitProfileInquiry(payload) {
  const res = await base44.functions.invoke('submitProfileInquiry', payload);
  return unwrap(res);
}

export async function fetchLaunchReadiness() {
  const res = await base44.functions.invoke('getLaunchReadiness', {});
  return unwrap(res) || { components: [] };
}

export async function adminVisibility(action, payload = {}) {
  const res = await base44.functions.invoke('adminVisibilityConsole', {
    ...sessionIdentity(),
    action,
    ...payload,
  });
  return unwrap(res) || { ok: false };
}

export function formatPrice(cents) {
  const value = Number(cents || 0) / 100;
  return value % 1 === 0 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

// Property prices are stored in whole dollars, not cents.
export function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Price not published';
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const PLAN_STATE_COPY = {
  none: 'No subscription',
  pending_checkout: 'Checkout started, not completed',
  incomplete: 'Payment not completed',
  active: 'Active',
  past_due: 'Payment failed',
  paused: 'Paused',
  canceled: 'Cancelled',
  expired: 'Ended',
};