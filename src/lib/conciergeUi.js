/**
 * Frontend protocol for concierge-driven interface changes.
 *
 * The AI never runs code and never touches application state directly. It can only
 * ask for one of the directives below, and the browser validates it against this
 * whitelist before doing anything. Anything unknown, absolute, or off the portal is
 * discarded silently.
 */

const ALLOWED_ROUTES = {
  '/ClientBookings': [],
  '/BookingPage': ['package', 'date', 'address'],
  '/PropertyLeads': [],
  '/PropertyPageBuilder': ['jobId'],
  '/VisibilityDashboard': ['section'],
  '/PrepaidPurchase': [],
  '/AutoFund': [],
  '/ClientJobGallery': ['jobId'],
  '/PublicAccountSettings': [],
};

const ALLOWED_PARAM_PATTERN = /^[A-Za-z0-9:_@.\- ]{1,80}$/;

export function sanitizeConciergeUi(ui) {
  if (!ui || ui.type !== 'navigate' || typeof ui.path !== 'string') return null;
  const raw = ui.path.trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;

  const [pathname, query = ''] = raw.split('?');
  const allowedParams = ALLOWED_ROUTES[pathname];
  if (!allowedParams) return null;

  const params = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query).entries()) {
    if (!allowedParams.includes(key)) continue;
    if (!ALLOWED_PARAM_PATTERN.test(value)) continue;
    params.set(key, value);
  }

  const queryString = params.toString();
  return {
    type: 'navigate',
    page: ui.page || '',
    label: typeof ui.label === 'string' ? ui.label.slice(0, 60) : '',
    path: queryString ? `${pathname}?${queryString}` : pathname,
  };
}

/** Apply one validated directive. Returns the path it navigated to, or null. */
export function applyConciergeUi(ui, navigate) {
  const directive = sanitizeConciergeUi(ui);
  if (!directive || typeof navigate !== 'function') return null;
  navigate(directive.path);
  return directive.path;
}

/** Optional display-only channel pages can subscribe to (filters, gallery layout). */
export const CONCIERGE_DISPLAY_EVENT = 'arriv:concierge-display';

export function dispatchConciergeDisplay(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONCIERGE_DISPLAY_EVENT, { detail }));
}