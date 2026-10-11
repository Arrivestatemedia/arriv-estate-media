import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ensureBrandedLinks } from '../../shared/brandedLink.ts';

/**
 * Turns Base44-hosted file addresses into links on Arriv's own domain.
 *
 * Open by design: applicant-facing pages (for example a photo preview) show
 * platform files and have no session. Only addresses on platform storage are
 * accepted — anything else is returned untouched — so this cannot be used as an
 * open redirect.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [body?.url].filter(Boolean);
    if (!urls.length) return Response.json({ links: {} });

    const base44 = createClientFromRequest(req);
    const links = await ensureBrandedLinks(base44, urls);
    return Response.json({ links });
  } catch (error) {
    return Response.json({ error: (error as Error).message, links: {} }, { status: 500 });
  }
});