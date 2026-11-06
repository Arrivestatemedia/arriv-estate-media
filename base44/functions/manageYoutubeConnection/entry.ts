import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { createYoutubeOAuthState } from '../../shared/youtubeOAuthState.ts';
import {
  isYoutubeConfigured,
  buildConsentUrl,
  getChannelConnection,
  getAccessToken,
  fetchChannelInfo,
} from '../../shared/youtubeClient.ts';
import { queueYoutubeVideo } from '../../shared/youtubeQueue.ts';


/**
 * manageYoutubeConnection
 * Administrator control of Arriv's YouTube channel and of the video hosting records.
 *
 * The channel is connected once, by an administrator, through Google's consent screen. Everything
 * afterwards is automatic: an editor marking a delivered video as an approved unbranded tour is
 * enough for the upload worker to publish it. If the channel is not connected, the worker reports
 * "blocked" and the customer gallery keeps showing the original Drive video, which stays
 * downloadable throughout.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action = 'status', jobId, driveFileId, editingTaskId, propertyAddress } = body || {};

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

    const configured = isYoutubeConfigured();

    if (action === 'connect_url') {
      if (!configured) {
        return Response.json({
          error: 'YouTube is not configured yet. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.',
          configured: false,
        }, { status: 400 });
      }
      const state = await createYoutubeOAuthState(
        auth.actorEmail || auth.actor || 'admin', secrets.get('YOUTUBE_CLIENT_SECRET'),
      );
      return Response.json({ success: true, url: buildConsentUrl(state), configured: true });
    }

    if (action === 'disconnect') {
      const connection = await getChannelConnection(base44);
      if (connection) {
        await base44.asServiceRole.entities.YouTubeChannelConnection.update(connection.id, {
          status: 'disconnected',
          access_token: '',
          refresh_token: '',
          access_token_expires_at: null,
        });
      }
      return Response.json({ success: true, connected: false });
    }

    if (action === 'uploads') {
      if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
      const rows = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ job_id: jobId }, '-created_date', 100);
      return Response.json({ uploads: rows || [] });
    }

    if (action === 'queue') {
      if (!jobId || !driveFileId) return Response.json({ error: 'jobId and driveFileId are required' }, { status: 400 });
      const job = await base44.asServiceRole.entities.Job.get(jobId);
      if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
      const queued = await queueYoutubeVideo(base44, {
        job,
        editingTaskId,
        driveFileId,
        fileName: body.fileName || 'video.mp4',
        propertyAddress,
      });
      return Response.json({ success: true, ...queued });
    }

    // ---- status ----
    const connection = await getChannelConnection(base44);
    let channelTitle = connection?.channel_title || null;
    let tokenHealthy = false;

    if (connection) {
      try {
        const token = await getAccessToken(base44, connection);
        tokenHealthy = !!token;
        const info = await fetchChannelInfo(token);
        if (info?.title) {
          channelTitle = info.title;
          if (info.title !== connection.channel_title) {
            await base44.asServiceRole.entities.YouTubeChannelConnection.update(connection.id, {
              channel_title: info.title,
              channel_id: info.id,
            });
          }
        }
      } catch (err) {
        tokenHealthy = false;
        console.error('YouTube connection check failed:', err?.message || err);
      }
    }

    const allUploads = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({}, '-created_date', 300);
    const counts = { queued: 0, uploading: 0, processing: 0, ready: 0, failed: 0, skipped: 0 };
    (allUploads || []).forEach((u) => {
      const key = String(u.upload_status || 'queued');
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });

    return Response.json({
      configured,
      connected: !!(connection && tokenHealthy),
      channel_title: channelTitle,
      connected_at: connection?.connected_at || null,
      connected_by: connection?.connected_by || null,
      visibility: 'unlisted',
      counts,
    });
  } catch (error) {
    console.error('manageYoutubeConnection error:', error);
    return Response.json({ error: error?.message || 'Could not read the YouTube connection' }, { status: 500 });
  }
}