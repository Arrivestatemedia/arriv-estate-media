const enc = new TextEncoder();

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(sig);
}

export async function verifySignature(secret, body, signature) {
  if (!signature) return false;
  const expected = await signPayload(secret, body);
  if (expected.length !== signature.length) return false;
  let res = 0;
  for (let i = 0; i < expected.length; i++) {
    res |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return res === 0;
}