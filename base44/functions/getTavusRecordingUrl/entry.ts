import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { generatePresignedS3Url, parseS3Key } from "../../shared/tavusRecordingStorage.ts";

/**
 * Returns a fresh, directly-downloadable presigned URL for a Tavus server-side
 * interview recording stored in our S3 bucket.
 *
 * Called from the admin UI when viewing an AI interview recording. The s3://
 * URI is a permanent reference, but presigned URLs expire after 7 days, so
 * this function generates a fresh one on each request.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { storageUri, s3Key } = body;

    const key = s3Key || parseS3Key(storageUri);
    if (!key) {
      return Response.json({ error: "storageUri or s3Key is required" }, { status: 400 });
    }

    const url = await generatePresignedS3Url(key);

    return Response.json({ url });
  } catch (error) {
    console.error("getTavusRecordingUrl error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});