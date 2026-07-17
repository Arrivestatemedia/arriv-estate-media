import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

/**
 * Best-effort header-stripping proxy so sites that send X-Frame-Options /
 * CSP frame-ancestors (Zillow, Realtor.com, etc.) can still be rendered inside
 * our in-app browser. Fetches the target page server-side, injects a <base> tag
 * so relative resources load from the target origin, and returns the HTML.
 *
 * NOTE: This is a best-effort "force load". Server-rendered pages render well;
 * JavaScript-heavy SPAs (Zillow, Redfin) that need same-origin API calls may
 * still render only partially — the in-app browser keeps an "Open in new tab"
 * fallback for those. The proxied content is sandboxed WITHOUT allow-same-origin
 * on the client, so it cannot access the app's auth tokens.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const target = body.url;
    if (!target || !/^https?:\/\//i.test(target)) {
      return Response.json({ error: "Invalid url" }, { status: 400 });
    }

    let origin = "";
    try { origin = new URL(target).origin; } catch {}

    const r = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    const html = await r.text();

    let out = html;
    if (origin) {
      if (/<head[^>]*>/i.test(out)) {
        out = out.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${origin}">`);
      } else if (/<html[^>]*>/i.test(out)) {
        out = out.replace(/<html[^>]*>/i, (m) => `${m}\n<base href="${origin}">`);
      } else {
        out = `<base href="${origin}">\n` + out;
      }
    }

    return Response.json({ html: out, ok: true });
  } catch (e) {
    return Response.json({ error: e?.message || "Proxy failed" }, { status: 500 });
  }
});