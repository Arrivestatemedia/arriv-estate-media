import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  isYoutubeConfigured,
  getChannelConnection,
  getAccessToken,
  getDriveFileMeta,
  createResumableSession,
  pushChunksWithinBudget,
  querySessionOffset,
  getVideoStatus,
  CHUNK_SIZE,
  buildYoutubeMetadata,
} from '../../shared/youtubeClient.ts';
import { resolvePropertyAddress } from '../../shared/mlsJobContext.ts';

/**
 * processYoutubeUpload
 * Moves queued delivered videos onto Arriv's YouTube channel, one bounded step per invocation.
 *
 * Why it works this way:
 *  - A delivered video can be far larger than a single function invocation can stream, so the
 *    upload is a resumable session. Each run pushes as many 8 MB chunks as fit inside a time
 *    budget and records the confirmed byte offset. An invocation that ends early — or is killed —
 *    simply resumes from that offset on the next run.
 *  - Nothing is ever buffered whole. Chunks are read from Google Drive with Range requests and
 *    written straight to YouTube.
 *  - The record only reaches `ready` (and only then receives a youtube_url) once YouTube reports
 *    the video as viewable. Until then the customer sees "Preparing Unbranded Video Link".
 *  - A YouTube failure never touches Google Drive delivery: the original stays downloadable.
 *
 * Invoked by the "YouTube Upload Processing" workflow every 5 minutes.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { retryUploadId } = body || {};

    // Explicit administrator retry: re-queue without asking the editor to upload the video again.
    if (retryUploadId) {
      const auth = await verifyAdmin(base44, body, new URL(req.url));
      if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

      const rows = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ id: retryUploadId }, undefined, 1);
      const upload = rows?.[0];
      if (!upload) return Response.json({ error: 'Video upload not found' }, { status: 404 });

      const reset = await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
        upload_status: 'queued',
        upload_session_uri: '',
        bytes_uploaded: 0,
        error_message: '',
        retry_count: Number(upload.retry_count || 0) + 1,
      });
      return Response.json({ success: true, requeued: true, upload: reset });
    }

    if (!isYoutubeConfigured()) {
      return Response.json({
        success: false,
        blocked: true,
        reason: 'YouTube OAuth credentials are not configured (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET).',
      });
    }

    const connection = await getChannelConnection(base44);
    if (!connection) {
      return Response.json({
        success: false,
        blocked: true,
        reason: 'No YouTube channel is connected yet. An administrator must connect the Arriv channel.',
      });
    }

    const pending = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({}, '-created_date', 300);
    const candidates = (pending || []).filter((r: any) => ['queued', 'uploading', 'processing'].includes(String(r.upload_status)));

    if (candidates.length === 0) {
      return Response.json({ success: true, processed: 0, note: 'Nothing pending' });
    }

    const youtubeToken = await getAccessToken(base44, connection);
    const driveToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    const results: any[] = [];
    const BUDGET_MS = 45000;
    const runStarted = Date.now();

    for (const upload of candidates.slice(0, 8)) {
      if (Date.now() - runStarted > BUDGET_MS) {
        results.push({ id: upload.id, result: 'deferred — time budget reached' });
        break;
      }

      try {
        // 1. Already uploaded — only waiting on YouTube's own processing.
        if (upload.upload_status === 'processing' || (upload.youtube_video_id && upload.upload_status !== 'ready')) {
          if (!upload.youtube_video_id) {
            results.push({ id: upload.id, result: 'processing without a video id — needs review' });
            continue;
          }
          const status = await getVideoStatus(youtubeToken, upload.youtube_video_id);
          if (status.ready) {
            await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
              upload_status: 'ready',
              processing_status: 'succeeded',
              youtube_url: `https://www.youtube.com/watch?v=${upload.youtube_video_id}`,
              completed_at: new Date().toISOString(),
            });
            results.push({ id: upload.id, result: 'ready' });
          } else if (status.uploadStatus === 'failed' || status.uploadStatus === 'rejected') {
            await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
              upload_status: 'failed',
              processing_status: 'failed',
              error_message: status.failureReason || `YouTube reported ${status.uploadStatus}`,
            });
            results.push({ id: upload.id, result: 'failed' });
          } else {
            await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
              processing_status: 'processing',
            });
            results.push({ id: upload.id, result: `still processing (${status.processingStatus})` });
          }
          continue;
        }

        // 2. Read the source metadata once.
        const meta = await getDriveFileMeta(driveToken, upload.drive_file_id);
        const totalBytes = Number(meta.size || 0);
        if (!totalBytes) throw new Error('The delivered video has no readable size in Google Drive');

        // Guard: the required title format must still hold.
        const titleCheck = buildYoutubeMetadata(upload.property_address, null);
        const title = upload.video_title || titleCheck?.title;
        const description = upload.video_description || titleCheck?.description;
        if (!title || !description) throw new Error('This video has no usable street address for the required title format');

        // 3. Resume an existing session, or open one.
        let sessionUri = upload.upload_session_uri || '';
        let offset = Number(upload.bytes_uploaded || 0);

        if (!sessionUri) {
          sessionUri = await createResumableSession(youtubeToken, {
            title,
            description,
            totalBytes,
            mimeType: meta.mimeType || 'video/mp4',
            privacyStatus: upload.visibility || 'unlisted',
            madeForKids: upload.made_for_kids === true,
          });
          offset = 0;
          await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
            upload_session_uri: sessionUri,
            bytes_total: totalBytes,
            bytes_uploaded: 0,
            upload_status: 'uploading',
            last_attempt_at: new Date().toISOString(),
            video_title: title,
            video_description: description,
          });
        } else if (offset > 0) {
          const remote = await querySessionOffset(sessionUri, totalBytes);
          if (remote.done && remote.videoId) {
            await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
              youtube_video_id: remote.videoId,
              bytes_uploaded: totalBytes,
              upload_status: 'processing',
              uploaded_at: new Date().toISOString(),
            });
            results.push({ id: upload.id, result: 'uploaded (recovered)' });
            continue;
          }
          offset = remote.nextOffset || 0;
        }

        const pushed = await pushChunksWithinBudget({
          driveToken,
          driveFileId: upload.drive_file_id,
          sessionUri,
          totalBytes,
          startOffset: offset,
          mimeType: meta.mimeType || 'video/mp4',
          budgetMs: Math.min(BUDGET_MS, CHUNK_SIZE * 6),
        });

        if (pushed.done && pushed.videoId) {
          const status = await getVideoStatus(youtubeToken, pushed.videoId);
          const ready = status.ready;
          await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
            youtube_video_id: pushed.videoId,
            bytes_uploaded: totalBytes,
            upload_status: ready ? 'ready' : 'processing',
            processing_status: ready ? 'succeeded' : 'processing',
            youtube_url: ready ? `https://www.youtube.com/watch?v=${pushed.videoId}` : '',
            uploaded_at: new Date().toISOString(),
            completed_at: ready ? new Date().toISOString() : null,
            last_attempt_at: new Date().toISOString(),
          });
          results.push({ id: upload.id, result: ready ? 'ready' : 'uploaded, processing' });
        } else {
          await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
            bytes_uploaded: pushed.bytesUploaded,
            upload_status: 'uploading',
            last_attempt_at: new Date().toISOString(),
          });
          results.push({ id: upload.id, result: `${pushed.bytesUploaded}/${totalBytes} bytes` });
        }
      } catch (err: any) {
        console.error('YouTube upload step failed:', upload.id, err?.message || err);
        await base44.asServiceRole.entities.YouTubeVideoUpload.update(upload.id, {
          upload_status: 'failed',
          error_message: String(err?.message || err).slice(0, 900),
          last_attempt_at: new Date().toISOString(),
          retry_count: Number(upload.retry_count || 0) + 1,
        });
        results.push({ id: upload.id, result: `failed: ${err?.message || err}` });
      }
    }

    return Response.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    console.error('processYoutubeUpload error:', error);
    return Response.json({ error: error?.message || 'YouTube upload processing failed' }, { status: 500 });
  }
});