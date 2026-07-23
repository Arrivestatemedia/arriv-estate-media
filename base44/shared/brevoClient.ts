const DEFAULT_SENDER_EMAIL = "careers@arrivestatemedia.com";
const DEFAULT_SENDER_NAME = "Arriv Estate Media";

export async function sendBrevoEmail({
  to,
  subject,
  htmlContent,
  senderName = DEFAULT_SENDER_NAME,
  senderEmail = DEFAULT_SENDER_EMAIL,
}) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brevo error ${res.status}: ${errText}`);
  }
  return { ok: true };
}