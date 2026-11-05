// youtubeClient.ts
// Server-side YouTube Data API v3 client for Arriv's own channel.
//
// Delivered property videos are tens to hundreds of megabytes. Nothing here ever holds a whole
// video in memory: the source is read from Google Drive one chunk at a time (Range requests) and
// streamed straight into a YouTube resumable upload session. Because the session URI is stored on
// the record, an interrupted upload resumes from the last confirmed byte instead of restarting,
// so it also survives a function invocation timing out.
//
// Credentials: YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET identify Arriv's OAuth app, and the
// refresh token obtained through the administrator connect flow is stored on the
// YouTubeChannelConnection record (admin-readable only).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const DATA_URL = "https://www.googleapis.com/youtube/v3";
const DRIVE_URL = "https://www.googleapis.com/drive/v3/files";

/** 8 MB — a multiple of 256 KB, which the YouTube resumable protocol requires. */
export const CHUNK_SIZE = 8 * 1024 * 1024;

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function isYoutubeConfigured(): boolean {
  return !!(Deno.env.get("YOUTUBE_CLIENT_ID") && Deno.env.get("YOUTUBE_CLIENT_SECRET"));
}

export function youtubeRedirectUri(): string {
  const configured = Deno.env.get("YOUTUBE_REDIRECT_URI");
  if (configured) return configured;
  const appUrl = Deno.env.get("APP_PUBLIC_URL") || "https://arrivestatemedia.base44.app";
  return `${appUrl.replace(/\/$/, "")}/functions/youtubeOAuthCallback`;
}

export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: Deno.env.get("YOUTUBE_CLIENT_ID") || "",
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("YOUTUBE_CLIENT_ID") || "",
      client_secret: Deno.env.get("YOUTUBE_CLIENT_SECRET") || "",
      redirect_uri: youtubeRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube token exchange failed: ${data?.error_description || data?.error || res.status}`);
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("YOUTUBE_CLIENT_ID") || "",
      client_secret: Deno.env.get("YOUTUBE_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${data?.error_description || data?.error || res.status}`);
  return data as { access_token: string; expires_in: number; scope?: string };
}

/**
 * The single row describing Arriv's connected channel. Returns null when the feature has not
 * been connected yet — callers must treat that as "blocked", never as "ready".
 */
export async function getChannelConnection(base44: any) {
  const rows = await base44.asServiceRole.entities.YouTubeChannelConnection.list("-created_date", 5);
  const connected = (rows || []).find((r: any) => r.status === "connected" && r.refresh_token);
  return connected || null;
}

/** A usable access token, refreshed and persisted when the stored one is close to expiry. */
export async function getAccessToken(base44: any, connection: any): Promise<string> {
  const expiresAt = connection?.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection?.access_token && expiresAt - Date.now() > 120000) return connection.access_token;

  const refreshed = await refreshAccessToken(connection.refresh_token);
  await base44.asServiceRole.entities.YouTubeChannelConnection.update(connection.id, {
    access_token: refreshed.access_token,
    access_token_expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    status: "connected",
  });
  return refreshed.access_token;
}

export async function fetchChannelInfo(accessToken: string) {
  const res = await fetch(`${DATA_URL}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const channel = data?.items?.[0];
  if (!channel) return null;
  return { id: channel.id, title: channel.snippet?.title || "" };
}

// ---------------------------------------------------------------------------
// Video metadata — formatting is fixed and must not drift.
// ---------------------------------------------------------------------------

/** The property's street address only: no city, state or ZIP. */
export function streetAddressOnly(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const firstSegment = value.split(",")[0].trim();
  return (firstSegment || value).replace(/\s+/g, " ");
}

export function buildYoutubeMetadata(propertyAddress: string, city?: string) {
  let street = streetAddressOnly(propertyAddress);
  // A job whose location holds only a city ("Charlotte, NC") must not become the title.
  if (!street || (city && street.toLowerCase() === String(city).trim().toLowerCase()) || /^\d{5}(-\d{4})?$/.test(street)) {
    return null;
  }
  return {
    title: `${street} | Home Tour (MLS)`,
    description: `Full property video for ${street}\n\nFor MLS and informational purposes.`,
    street,
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function getDriveFileMeta(accessToken: string, fileId: string) {
  const res = await fetch(`${DRIVE_URL}/${fileId}?fields=id,name,mimeType,size`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("The delivered video could not be read from Google Drive");
  return res.json() as Promise<{ id: string; name: string; mimeType: string; size?: string }>;
}

async function fetchDriveChunk(accessToken: string, fileId: string, start: number, end: number): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Drive range read failed (${res.status})`);
  return res.arrayBuffer();
}

/** Opens a resumable upload session and returns its URI. */
export async function createResumableSession(accessToken: string, params: {
  title: string;
  description: string;
  totalBytes: number;
  mimeType: string;
  privacyStatus?: string;
  madeForKids?: boolean;
}): Promise<string> {
  const res = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(params.totalBytes),
      "X-Upload-Content-Type": params.mimeType || "video/mp4",
    },
    body: JSON.stringify({
      snippet: {
        title: params.title,
        description: params.description,
        categoryId: "22",
      },
      status: {
        privacyStatus: params.privacyStatus || "unlisted",
        selfDeclaredMadeForKids: params.madeForKids === true,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`YouTube upload session failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const location = res.headers.get("location");
  if (!location) throw new Error("YouTube did not return an upload session");
  return location;
}

export interface ChunkResult {
  done: boolean;
  nextOffset: number;
  videoId?: string;
}

/** Pushes one chunk at the given offset. */
export async function uploadChunk(params: {
  sessionUri: string;
  bytes: ArrayBuffer;
  start: number;
  total: number;
  mimeType?: string;
}): Promise<ChunkResult> {
  const { sessionUri, bytes, start, total } = params;
  const end = start + bytes.byteLength - 1;
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Type": params.mimeType || "video/mp4",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });

  if (res.status === 308) {
    const range = res.headers.get("range");
    const confirmed = range ? Number(String(range).split("-")[1]) + 1 : start;
    return { done: false, nextOffset: confirmed };
  }
  if (res.status === 200 || res.status === 201) {
    const data = await res.json();
    return { done: true, nextOffset: total, videoId: data?.id, ...(data?.id ? {} : {}) };
  }
  const detail = await res.text();
  throw new Error(`YouTube chunk upload failed (${res.status}): ${detail.slice(0, 300)}`);
}

/** Reads how much of a session YouTube already holds, so a resumed upload can continue. */
export async function querySessionOffset(sessionUri: string, total: number): Promise<ChunkResult> {
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${total}` },
  });
  if (res.status === 308) {
    const range = res.headers.get("range");
    const next = range ? Number(String(range).split("-")[1]) + 1 : 0;
    return { done: false, nextOffset: Number.isFinite(next) ? next : 0 };
  }
  if (res.status === 200 || res.status === 201) {
    const data = await res.json();
    return { done: true, nextOffset: total, videoId: data?.id };
  }
  return { done: false, nextOffset: 0 };
}

/**
 * Whether the uploaded video is actually viewable. A brand new upload reports `uploadStatus`
 * `uploaded` or `processed`; anything else means the link must not be shown to the customer yet.
 */
export async function getVideoStatus(accessToken: string, videoId: string) {
  const res = await fetch(`${DATA_URL}/videos?part=status,processingDetails,snippet&id=${videoId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ready: false, uploadStatus: "unknown", processingStatus: "unknown", failureReason: null as string | null };
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item) return { ready: false, uploadStatus: "unknown", processingStatus: "unknown", failureReason: "not_found" };
  const uploadStatus = String(item.status?.uploadStatus || "unknown");
  const processing = String(item.status?.processingDetails?.processingStatus || item.processingDetails?.processingStatus || "unknown");
  return {
    ready: uploadStatus === "processed" || uploadStatus === "uploaded",
    uploadStatus,
    processingStatus: processing,
    failureReason: item.status?.failureReason || null,
    privacyStatus: item.status?.privacyStatus || null,
    title: item.snippet?.title || null,
  };
}

/**
 * One chunk-progress step of a video upload within a time budget, so a single invocation
 * can never run long enough to be killed mid-chunk.
 */
export async function pushChunksWithinBudget(params: {
  driveToken: string;
  driveFileId: string;
  sessionUri: string;
  totalBytes: number;
  startOffset: number;
  mimeType: string;
  budgetMs: number;
}): Promise<{ done: boolean; bytesUploaded: number; videoId?: string }> {
  const started = Date.now();
  let offset = params.startOffset;

  while (offset < params.totalBytes) {
    if (Date.now() - started > params.budgetMs) {
      return { done: false, bytesUploaded: offset };
    }
    const end = Math.min(offset + CHUNK_SIZE, params.totalBytes) - 1;
    const chunk = await fetchDriveChunk(params.driveToken, params.driveFileId, offset, end);
    if (chunk.byteLength === 0) {
      throw new Error("Google Drive returned no data for the video");
    }
    const result = await uploadChunk({
      sessionUri: params.sessionUri,
      bytes: chunk,
      start: offset,
      total: params.totalBytes,
      mimeType: params.mimeType,
    });
    if (result.done) {
      return { done: true, bytesUploaded: params.totalBytes, videoId: result.videoId };
    }
    if (result.nextOffset <= offset) {
      throw new Error("YouTube did not accept the chunk, upload stalled");
    }
    offset = result.nextOffset;
  }
  return { done: false, bytesUploaded: offset };
}