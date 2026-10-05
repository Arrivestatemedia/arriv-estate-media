import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Regional Media Specialist job pages:
//   DMV (DC, MD, VA) → /MediaSpecialist        (Maryland market)
//   Georgia (GA)     → /MediaSpecialistAtl     (Atlanta market)
//   Anywhere else    → /MediaSpecialist        (default market)

const DMV_STATES = new Set([
  'dc', 'd.c.', 'district of columbia', 'washington dc', 'washington, dc',
  'md', 'maryland',
  'va', 'virginia',
]);

const GA_STATES = new Set([
  'ga', 'georgia',
]);

const DEFAULT_ROUTE = '/MediaSpecialist';
const ATLANTA_ROUTE = '/MediaSpecialistAtl';

function normalizeState(s: string): string {
  return String(s || '').trim().toLowerCase();
}

function routeForState(state: string): { route: string; region: string } {
  const norm = normalizeState(state);
  if (GA_STATES.has(norm)) return { route: ATLANTA_ROUTE, region: 'atlanta' };
  if (DMV_STATES.has(norm)) return { route: DEFAULT_ROUTE, region: 'dmv' };
  return { route: DEFAULT_ROUTE, region: 'default' };
}

function getClientIp(req: Request): string {
  const headers = req.headers || new Headers();
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return '';
}

export default async function(req: Request): Promise<Response> {
  try {
    const ip = getClientIp(req);
    let state = '';
    let country = '';
    let city = '';
    let geoSource = 'unknown';

    if (ip) {
      // ipwho.is: free, HTTPS, no API key required.
      try {
        const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
        if (r.ok) {
          const d: any = await r.json();
          if (d && d.success !== false) {
            state = d.region || d.region_code || '';
            country = d.country_code || '';
            city = d.city || '';
            geoSource = 'ipwho.is';
          }
        }
      } catch (_e) {
        // Geolocation failure is non-fatal — try fallback provider below.
      }

      // Fallback: ipapi.co (free, HTTPS, no key) if the first provider failed.
      if (geoSource === 'unknown') {
        try {
          const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
          if (r.ok) {
            const d: any = await r.json();
            if (d && !d.error && (d.region || d.region_code)) {
              state = d.region || d.region_code || '';
              country = d.country_code || '';
              city = d.city || '';
              geoSource = 'ipapi.co';
            }
          }
        } catch (_e) {
          // Both providers failed — non-fatal, default route is returned.
        }
      }
    }

    const { route, region } = routeForState(state);
    return Response.json({
      route,
      region,
      state,
      country,
      city,
      ip: ip || '',
      geoSource,
    });
  } catch (error: any) {
    // Never block the redirect on a server error — return the default route.
    return Response.json(
      { error: error?.message || 'unknown', route: DEFAULT_ROUTE, region: 'default' },
      { status: 200 }
    );
  }
}