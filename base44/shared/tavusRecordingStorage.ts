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
export async function generatePresignedS3Url(s3Key: string): Promise<string> {
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

  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
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