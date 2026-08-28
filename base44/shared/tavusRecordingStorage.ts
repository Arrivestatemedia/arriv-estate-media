/**
 * Tavus server-side recording storage helpers.
 * Handles S3 recording destination config for the Tavus API and presigned
 * URL generation for playback in the admin UI.
 *
 * Server-side only (Deno). Never expose AWS_SECRET_ACCESS_KEY to the client.
 */

/** Extract the AWS region code (e.g. "us-east-2") from a possibly verbose string. */
function normalizeRegion(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Already a valid region code (e.g. "us-east-2", "eu-west-1")
  if (/^[a-z]{2}-[a-z]+-\d+$/.test(trimmed)) return trimmed;
  // Extract region code from strings like "US East (Ohio) us-east-2"
  const match = trimmed.match(/[a-z]{2}-[a-z]+-\d+/);
  return match ? match[0] : trimmed;
}

/** Returns the recording_storage config object for the Tavus API, or null if not configured. */
export function getRecordingStorageConfig() {
  const bucket = Deno.env.get("AWS_S3_BUCKET");
  const region = normalizeRegion(Deno.env.get("AWS_S3_REGION") || "");
  const roleArn = Deno.env.get("AWS_S3_ROLE_ARN");
  if (!bucket || !region || !roleArn) return null;
  return {
    provider: "s3",
    bucket_name: bucket,
    bucket_region: region,
    assume_role_arn: roleArn,
  };
}

/** Returns true if Tavus server-side recording is fully configured. */
export function isRecordingConfigured(): boolean {
  return getRecordingStorageConfig() !== null;
}

/**
 * Generate a presigned S3 GET URL for playback.
 * Uses the ArrivRecordingReader IAM user credentials.
 * URL is valid for 7 days (604800 seconds — the max for IAM user presigned URLs).
 */
export async function generatePresignedS3Url(
  s3Key: string,
  opts?: { responseContentType?: string; responseContentDisposition?: string },
): Promise<string> {
  const { S3Client, GetObjectCommand } = await import("npm:@aws-sdk/client-s3@3.620.0");
  const { getSignedUrl } = await import("npm:@aws-sdk/s3-request-presigner@3.620.0");

  const bucket = Deno.env.get("AWS_S3_BUCKET");
  const region = normalizeRegion(Deno.env.get("AWS_S3_REGION") || "");
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3 credentials not configured");
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const commandInput: any = { Bucket: bucket, Key: s3Key };
  if (opts?.responseContentType) commandInput.ResponseContentType = opts.responseContentType;
  if (opts?.responseContentDisposition) commandInput.ResponseContentDisposition = opts.responseContentDisposition;
  const command = new GetObjectCommand(commandInput);
  return getSignedUrl(client, command, { expiresIn: 604800 });
}

/** Parse the S3 object key from a storage URI (s3://bucket/key) or return the key as-is. */
export function parseS3Key(storageUriOrKey: string): string {
  if (!storageUriOrKey) return "";
  if (storageUriOrKey.startsWith("s3://")) {
    const withoutProtocol = storageUriOrKey.slice(5);
    const slashIdx = withoutProtocol.indexOf("/");
    return slashIdx >= 0 ? withoutProtocol.slice(slashIdx + 1) : "";
  }
  return storageUriOrKey;
}

/**
 * Download an S3 object as a Blob by streaming its body in chunks.
 * More memory-efficient than fetch(presignedUrl).blob() for large files.
 * Throws if the object exceeds maxBytes.
 */
export async function downloadS3ObjectAsBlob(s3Key: string, maxBytes = 25 * 1024 * 1024): Promise<Blob> {
  const { S3Client, GetObjectCommand } = await import("npm:@aws-sdk/client-s3@3.620.0");

  const bucket = Deno.env.get("AWS_S3_BUCKET");
  const region = normalizeRegion(Deno.env.get("AWS_S3_REGION") || "");
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3 credentials not configured");
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const response: any = await client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
  const stream = response.Body;
  if (!stream) throw new Error("S3 object has no body");

  // Collect chunks
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  for await (const chunk of stream) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    totalSize += bytes.length;
    if (totalSize > maxBytes) {
      throw new Error(`Recording exceeds ${Math.round(maxBytes / 1024 / 1024)}MB and cannot be transcribed (Whisper limit)`);
    }
    chunks.push(bytes);
  }

  return new Blob(chunks, { type: response.ContentType || "video/mp4" });
}

/**
 * Convert a video/audio file to MP3 via the Zamzar API.
 * Returns the converted MP3 as a Blob (small enough for Whisper transcription).
 *
 * Flow: start job → poll until complete → download result.
 * Throws on conversion failure or timeout.
 */
export async function convertToMp3ViaZamzar(
  sourceUrl: string,
  sourceFormat: string,
  opts?: { maxPollMs?: number; pollIntervalMs?: number },
): Promise<Blob> {
  const apiKey = Deno.env.get("ZAMZAR_API_KEY");
  if (!apiKey) throw new Error("ZAMZAR_API_KEY not configured");

  const maxPollMs = opts?.maxPollMs ?? 90_000; // 90 seconds max wait
  const pollIntervalMs = opts?.pollIntervalMs ?? 3_000;
  const auth = btoa(`${apiKey}:`);

  // ─── Start the conversion job ──────────────────────────────────────────
  const startRes = await fetch("https://api.zamzar.com/v1/jobs", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      source_file: sourceUrl,
      source_format: sourceFormat,
      target_format: "mp3",
    }),
  });
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Zamzar job start failed (${startRes.status}): ${errText}`);
  }
  const job = await startRes.json();
  const jobId = job.id;
  if (!jobId) throw new Error("Zamzar returned no job ID");

  // ─── Poll until the job completes ───────────────────────────────────────
  const deadline = Date.now() + maxPollMs;
  let result: any = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`https://api.zamzar.com/v1/jobs/${jobId}`, {
      headers: { "Authorization": `Basic ${auth}` },
    });
    if (!pollRes.ok) continue;
    const status = await pollRes.json();
    if (status.status === "successful") {
      result = status;
      break;
    }
    if (status.status === "failed") {
      throw new Error(`Zamzar conversion failed: ${JSON.stringify(status)}`);
    }
    // status "pending" or "converting" — keep polling
  }
  if (!result) throw new Error("Zamzar conversion timed out");

  // ─── Download the converted file ────────────────────────────────────────
  const fileId = result.target_files?.[0]?.id;
  if (!fileId) throw new Error("Zamzar returned no converted file");

  const dlRes = await fetch(`https://api.zamzar.com/v1/jobs/${jobId}/file/${fileId}`, {
    headers: { "Authorization": `Basic ${auth}` },
  });
  if (!dlRes.ok) {
    const errText = await dlRes.text();
    throw new Error(`Zamzar download failed (${dlRes.status}): ${errText}`);
  }
  return await dlRes.blob();
}

/**
 * Ensure an S3 object has a recognizable file extension by copying it to a
 * new key with the given extension (server-side S3 copy — no download), then
 * return a presigned URL for the new key. Used so Whisper (TranscribeAudio)
 * can detect the audio format from the URL path.
 *
 * If the original key already ends with the extension, just presign it.
 * If the copied key already exists, the copy is skipped (idempotent).
 */
export async function ensureExtensionAndPresign(s3Key: string, ext: string): Promise<string> {
  const { S3Client, HeadObjectCommand, CopyObjectCommand, GetObjectCommand } = await import("npm:@aws-sdk/client-s3@3.620.0");
  const { getSignedUrl } = await import("npm:@aws-sdk/s3-request-presigner@3.620.0");

  const bucket = Deno.env.get("AWS_S3_BUCKET");
  const region = normalizeRegion(Deno.env.get("AWS_S3_REGION") || "");
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3 credentials not configured");
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const extWithDot = ext.startsWith(".") ? ext : `.${ext}`;
  if (s3Key.toLowerCase().endsWith(extWithDot.toLowerCase())) {
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: s3Key }), { expiresIn: 604800 });
  }

  const newKey = `${s3Key}${extWithDot}`;

  // Check if the extended key already exists (idempotent)
  let exists = false;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: newKey }));
    exists = true;
  } catch (_) { exists = false; }

  if (!exists) {
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: newKey,
      CopySource: `${bucket}/${s3Key}`,
    }));
  }

  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: newKey }), { expiresIn: 604800 });
}