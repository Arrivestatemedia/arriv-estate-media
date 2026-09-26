/**
 * Twilio webhook signature validation.
 *
 * Implements Twilio's documented request-signature algorithm exactly:
 *   - HMAC-SHA1 (NOT SHA-256 — Twilio's protocol is SHA-1)
 *   - Base64 encoded (NOT hex)
 *   - Signed over: exact public webhook URL + sorted POST parameters
 *   - Compared against the X-Twilio-Signature header
 *
 * For JSON webhook requests, Twilio appends a bodySHA256 query parameter
 * to the URL and signs the URL with no additional POST parameters.
 *
 * Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Arriv-to-Arriv HMAC-SHA256 cross-app integrations are a SEPARATE security
 * contract and must NOT be changed. This module only handles Twilio's
 * provider-specific HMAC-SHA1 protocol.
 */

/**
 * Compute HMAC-SHA1 and return Base64-encoded result.
 * This is Twilio's signing algorithm.
 */
async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Compute SHA-256 hex digest of a string (for JSON bodySHA256).
 */
async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  const bytes = new Uint8Array(hashBuf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build candidate public URLs that Twilio might have signed.
 *
 * Behind Base44's Cloudflare Workers dispatch, req.url is an internal URL
 * (base44-dispatcher-production.base44.workers.dev/run/<id>) that does NOT
 * match the public URL Twilio called. We cannot rely on req.url or
 * BASE44_APP_DOMAIN alone, so we generate candidates from every known
 * public base and try each one.
 *
 * @param functionName - The webhook function name (e.g. "twilioSmsWebhook")
 * @param queryString  - Optional query string from the original request (e.g. "?menu=1")
 */
function getCandidateUrls(functionName: string, queryString: string): string[] {
  const bases: string[] = [];

  // Custom domain (if set)
  const appDomain = Deno.env.get('BASE44_APP_DOMAIN');
  if (appDomain) {
    bases.push(appDomain.replace(/\/+$/, ''));
  }

  // Published app domain (always a candidate)
  bases.push('https://arrivestatemedia.base44.app');

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    for (const prefix of ['', '/api']) {
      const url = `${base}${prefix}/functions/${functionName}${queryString || ''}`;
      if (!seen.has(url)) {
        seen.add(url);
        candidates.push(url);
      }
    }
  }
  return candidates;
}

/**
 * Constant-time string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate a Twilio webhook request signature.
 *
 * Handles three content types:
 * 1. application/x-www-form-urlencoded — sort params, concat key+value, append to URL
 * 2. application/json — compute bodySHA256, append to URL, no params
 * 3. Empty body (GET or POST with no body) — sign URL only, no params
 *
 * @param req - The original Request object (body must NOT have been consumed yet;
 *              pass the raw body string separately)
 * @param body - The raw request body string (may be empty for GET)
 * @param functionName - The webhook function name (e.g. "twilioSmsWebhook").
 *                       Used to construct candidate public URLs, since req.url
 *                       behind Base44's Cloudflare dispatch is internal.
 * @returns true if the signature is valid, false otherwise
 */
export async function validateTwilioRequest(
  req: Request,
  body: string,
  functionName?: string
): Promise<boolean> {
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!authToken) return false; // fail-secure

  const signature = req.headers.get('X-Twilio-Signature');
  if (!signature) return false; // missing signature → reject

  const contentType = req.headers.get('content-type') || '';

  // Extract query string from the original request (e.g. "?menu=1" for voice)
  let queryString = '';
  try {
    const urlObj = new URL(req.url);
    queryString = urlObj.search;
  } catch { /* ignore */ }

  // Build candidate URLs — req.url is internal (Cloudflare Workers dispatch),
  // so we construct public URLs from known domains + function name.
  const urlVariants = functionName
    ? getCandidateUrls(functionName, queryString)
    : [req.url];

  // For each URL variant, compute the signature and check.
  let debugInfo: any = {
    reqUrl: req.url,
    appDomain: Deno.env.get('BASE44_APP_DOMAIN'),
    signatureHeader: signature,
    contentType,
    bodyLength: body.length,
    functionName,
    variants: [],
  };
  for (const candidateUrl of urlVariants) {
    let dataString: string;
    if (contentType.includes('application/json') && body.length > 0) {
      const bodyHash = await sha256Hex(body);
      const separator = candidateUrl.includes('?') ? '&' : '?';
      dataString = `${candidateUrl}${separator}bodySHA256=${bodyHash}`;
    } else if (body.length > 0) {
      const params = new URLSearchParams(body);
      const sortedKeys = Array.from(params.keys()).sort();
      let paramStr = '';
      for (const key of sortedKeys) {
        paramStr += key + (params.get(key) || '');
      }
      dataString = candidateUrl + paramStr;
    } else {
      dataString = candidateUrl;
    }

    const computedSignature = await hmacSha1Base64(authToken, dataString);
    debugInfo.variants.push({
      url: candidateUrl,
      dataStringPreview: dataString.substring(0, 200),
      computedSig: computedSignature,
      matches: timingSafeEqual(computedSignature, signature),
    });
    if (timingSafeEqual(computedSignature, signature)) {
      return true;
    }
  }

  // Store debug info on the request for the caller to log
  (req as any).__twilioDebug = debugInfo;

  return false;
}

/**
 * Generate a Twilio-compatible signature for testing.
 *
 * This is a SEPARATE implementation from validateTwilioRequest's internal
 * signing, providing independent verification that the validation logic is
 * correct. Uses the same documented Twilio algorithm (HMAC-SHA1, Base64).
 *
 * For test use only — never use in production webhook handlers.
 */
export async function generateTwilioTestSignature(
  authToken: string,
  url: string,
  params: Record<string, string> | null,
  rawBody: string | null,
  isJson: boolean
): Promise<string> {
  let dataString: string;

  if (isJson && rawBody !== null) {
    const bodyHash = await sha256Hex(rawBody);
    const separator = url.includes('?') ? '&' : '?';
    dataString = `${url}${separator}bodySHA256=${bodyHash}`;
  } else if (params) {
    const sortedKeys = Object.keys(params).sort();
    let paramStr = '';
    for (const key of sortedKeys) {
      paramStr += key + (params[key] || '');
    }
    dataString = url + paramStr;
  } else {
    dataString = url;
  }

  return hmacSha1Base64(authToken, dataString);
}