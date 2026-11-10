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

export async function fetchVisibilityDashboard(profileId) {
  const res = await base44.functions.invoke('getVisibilityDashboard', profileId ? { profileId } : {});
  return unwrap(res) || { profile: null };
}

export async function fetchSubscriptionOverview(profileId) {
  const res = await base44.functions.invoke('manageVisibilitySubscription', { action: 'overview', profileId });
  return unwrap(res);
}

export async function subscriptionAction(action, payload = {}) {
  const res = await base44.functions.invoke('manageVisibilitySubscription', { action, ...payload });
  return unwrap(res);
}

export async function profileAction(action, payload = {}) {
  const res = await base44.functions.invoke('manageProfessionalProfile', { action, ...payload });
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
  const res = await base44.functions.invoke('adminVisibilityConsole', { action, ...payload });
  return unwrap(res) || { ok: false };
}

export function formatPrice(cents) {
  const value = Number(cents || 0) / 100;
  return value % 1 === 0 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
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