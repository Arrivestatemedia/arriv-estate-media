// Microsoft Graph API provider — token refresh, send, inbox list, message get.
// All HTTP-based (no raw TCP needed).

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MS_SCOPES = "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read offline_access";

export async function refreshMicrosoftToken(refreshToken: string) {
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const appDomain = Deno.env.get("BASE44_APP_DOMAIN");
  const redirectUri = `${appDomain}/SalesRepMicrosoftAuthCallback`;

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
      scope: MS_SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function getMicrosoftEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft /me failed: ${await res.text()}`);
  const data = await res.json();
  return data.mail || data.userPrincipalName || "";
}

export async function sendMicrosoftEmail(
  accessToken: string,
  { to, cc, bcc, subject, body, fromName }: { to: string; cc?: string; bcc?: string; subject: string; body: string; fromName?: string }
) {
  const message: any = {
    subject,
    body: { contentType: "HTML", content: body },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (cc) {
    message.ccRecipients = cc.split(",").map((e) => ({ emailAddress: { address: e.trim() } }));
  }
  if (bcc) {
    message.bccRecipients = bcc.split(",").map((e) => ({ emailAddress: { address: e.trim() } }));
  }

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Microsoft sendMail failed (${res.status}): ${errText}`);
  }
  return { ok: true };
}

export async function listMicrosoftInbox(accessToken: string, maxResults = 20) {
  const url = `${GRAPH_BASE}/me/mailFolders/inbox/messages?$top=${maxResults}&$select=subject,from,bodyPreview,receivedDateTime,id&$orderby=receivedDateTime desc`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft inbox list failed: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map((m: any) => ({
    id: m.id,
    from: m.from?.emailAddress?.address || "",
    subject: m.subject || "",
    snippet: m.bodyPreview || "",
    date: m.receivedDateTime,
  }));
}

export async function getMicrosoftMessage(accessToken: string, messageId: string) {
  const res = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Microsoft message get failed: ${await res.text()}`);
  const m = await res.json();
  return {
    id: m.id,
    from: m.from?.emailAddress?.address || "",
    subject: m.subject || "",
    snippet: m.bodyPreview || "",
    body: m.body?.content || "",
    date: m.receivedDateTime,
  };
}