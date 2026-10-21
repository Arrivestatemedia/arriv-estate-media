import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { appBaseUrl, recordTrackedClick } from '../../shared/smsTracking.ts';

/**
 * Arriv-owned link redirect for tracked SMS links.
 *
 * Reached as GET <app domain>/functions/smsLinkRedirect?c=<code>. On our own HTTPS
 * domain, no third-party shortener, no Messaging Service, no change to the sending
 * number. The visitor is redirected to the original destination exactly as it was
 * authored — the destination is never rewritten or altered.
 *
 * Privacy: no IP address and no raw user-agent is stored; only the click counts, the
 * first/last click time and an automated-access classification.
 */
Deno.serve(async (req) => {
  const fallback = `${appBaseUrl()}/`;

  try {
    const code = new URL(req.url).searchParams.get('c') || '';
    if (!code) return Response.redirect(fallback, 302);

    const base44 = createClientFromRequest(req);
    const rows = await base44.asServiceRole.entities.SmsTrackedLink.filter({ code });
    const link = rows && rows[0];

    if (!link || !link.target_url) {
      console.log('SMS LINK: unknown code', code);
      return Response.redirect(fallback, 302);
    }

    // Record engagement before redirecting, and never let it break the link.
    try {
      await recordTrackedClick(base44, link, req.headers.get('user-agent'));
    } catch (e) {
      console.error('SMS LINK: click recording failed:', e.message);
    }

    return Response.redirect(link.target_url, 302);
  } catch (error) {
    console.error('SMS link redirect error:', error.message);
    return Response.redirect(fallback, 302);
  }
});