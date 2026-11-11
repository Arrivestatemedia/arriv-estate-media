/**
 * Frontend protocol for concierge-driven interface changes.
 *
 * The AI never runs code and never touches application state directly. It can only
 * ask for one of the directives below, and the browser validates it against this
 * whitelist before doing anything. Anything unknown, absolute, or off the portal is
 * discarded silently.
 *
 * Two directive kinds:
 *   navigate  open a workspace (rendered as a Preferred surface beside the concierge)
 *   display   change how the current screen is presented (gallery size)
 *
 * Voice and text both arrive here, so one engine drives the interface for both channels.
 */

const ALLOWED_ROUTES = {
  '/ClientBookings': [],
  '/BookingPage': ['package', 'date', 'address'],
  '/PropertyLeads': [],
  '/PropertyPageBuilder': ['jobId', 'intent'],
  '/VisibilityDashboard': ['section'],
  '/PrepaidPurchase': [],
  '/AutoFund': [],
  '/ClientJobGallery': ['jobId'],
  '/PublicAccountSettings': [],
};

/** Which registered action opens which floating surface. */
const SURFACE_FOR_PAGE = {
  my_portal: 'dashboard',
  book_shoot: 'booking',
  my_properties: 'properties',
  property_page_builder: 'marketing',
  marketing: 'marketing',
  billing_visibility: 'billing',
  analytics: 'analytics',
  company: 'company',
  gallery: 'jobGallery',
  account_settings: 'account',
};

/** The workspace is the base of the Preferred experience; panels float on top of it. */
const SHELL_PATH = '/PreferredWorkspace';

const ALLOWED_PARAM_PATTERN = /^[A-Za-z0-9:_@.\- ]{1,80}$/;
const GALLERY_SIZES = ['small', 'medium', 'large'];

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
    query: queryString,
  };
}

export function sanitizeConciergeDisplay(ui) {
  if (!ui || ui.type !== 'display') return null;
  const target = String(ui.target || '');
  const size = String(ui.size || '');
  if (target !== 'gallery' || !GALLERY_SIZES.includes(size)) return null;
  const jobId = String(ui.open_job_id || '');
  return {
    target,
    size,
    open_job_id: ALLOWED_PARAM_PATTERN.test(jobId) ? jobId : "",
  };
}

/**
 * Apply one validated directive. Surfaces open in place so the workspace, the conversation
 * and the representative all stay alive; anything without a surface falls back to the router.
 */
export function applyConciergeDirective(ui, { open, navigate } = {}) {
  const display = sanitizeConciergeDisplay(ui);
  if (display) {
    // Remembered so the gallery opens at the size she was asked for, even when it is being
    // opened by this same instruction.
    try {
      window.localStorage.setItem("arriv_gallery_size", display.size);
    } catch {
      /* storage unavailable: the change still applies to an open gallery */
    }
    dispatchConciergeDisplay(display);

    if (display.open_job_id && typeof open === "function") {
      if (typeof navigate === "function") {
        // Stay on the member's own page: the gallery floats over it, and the dock survives.
        const basePath = window.location.pathname === SHELL_PATH ? SHELL_PATH : window.location.pathname;
        navigate(`${basePath}?jobId=${encodeURIComponent(display.open_job_id)}`, { replace: true });
      }
      open("jobGallery");
    }
    return `display:${display.target}:${display.size}`;
  }

  const directive = sanitizeConciergeUi(ui);
  if (!directive) return null;

  const surfaceKey = SURFACE_FOR_PAGE[directive.page];
  if (!surfaceKey || typeof open !== 'function') {
    if (typeof navigate === 'function') navigate(directive.path);
    return directive.path;
  }

  // The panel floats on top of wherever the member already is. Only the search changes, and
  // when they are not on the workspace we stay on their page: navigating to the shell would
  // unmount the dock, dropping the conversation they are in the middle of.
  const onShell = typeof window !== 'undefined' && window.location.pathname === SHELL_PATH;
  const basePath = onShell ? SHELL_PATH : (typeof window !== 'undefined' ? window.location.pathname : SHELL_PATH);
  if (directive.query && typeof navigate === 'function') {
    navigate(`${basePath}?${directive.query}`, { replace: true });
  }
  open(surfaceKey);
  return surfaceKey;
}

/** Backwards-compatible single-directive helper. */
export function applyConciergeUi(ui, navigate) {
  const directive = sanitizeConciergeUi(ui);
  if (!directive || typeof navigate !== 'function') return null;
  navigate(directive.path);
  return directive.path;
}

/** Display-only channel screens subscribe to this (gallery layout, filters). */
export const CONCIERGE_DISPLAY_EVENT = 'arriv:concierge-display';

export function dispatchConciergeDisplay(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONCIERGE_DISPLAY_EVENT, { detail }));
}