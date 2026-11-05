// youtubeQueue.ts
// Turns a delivered, explicitly-flagged video into a YouTube upload task.
//
// Only videos an editor explicitly marked as an approved unbranded MLS-ready tour reach this
// function. Nothing is inferred from a file name or a mime type — raw footage, source video and
// branded marketing edits never become YouTube tasks.
//
// The task is deduplicated on the Drive file id, so re-uploading the same edit (or retrying a
// failed batch) can never publish the same video twice.

import { buildYoutubeMetadata } from "./youtubeClient.ts";
import { resolvePropertyAddress } from "./mlsJobContext.ts";

export async function queueYoutubeVideo(base44: any, params: {
  job: any;
  editingTaskId?: string;
  driveFileId: string;
  fileName: string;
  propertyAddress?: string;
}): Promise<{ created: boolean; skipped?: string; id?: string; title?: string }> {
  const { job, editingTaskId, driveFileId, fileName } = params;

  if (!job?.id || !driveFileId) return { created: false, skipped: 'missing identifiers' };

  const existing = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ drive_file_id: driveFileId }, undefined, 5);
  if ((existing || []).length > 0) {
    return { created: false, skipped: 'already queued', id: existing[0].id };
  }

  const address = params.propertyAddress || (await resolvePropertyAddress(base44, job));
  const meta = buildYoutubeMetadata(address, job?.city);
  if (!meta) {
    // A property with no usable street address cannot produce the required title format. It is
    // recorded as skipped so an administrator can see why, rather than silently uploading a video
    // titled with a city name.
    const row = await base44.asServiceRole.entities.YouTubeVideoUpload.create({
      job_id: job.id,
      editing_task_id: editingTaskId || '',
      drive_file_id: driveFileId,
      drive_file_name: fileName,
      property_address: address,
      video_title: '',
      video_description: '',
      visibility: 'unlisted',
      made_for_kids: false,
      upload_status: 'skipped',
      processing_status: 'unknown',
      error_message: 'No street address on this job, so the required title format could not be built.',
      dedupe_key: `${job.id}:${driveFileId}`,
    });
    return { created: false, skipped: 'no street address', id: row.id };
  }

  const row = await base44.asServiceRole.entities.YouTubeVideoUpload.create({
    job_id: job.id,
    editing_task_id: editingTaskId || '',
    drive_file_id: driveFileId,
    drive_file_name: fileName,
    property_address: meta.street,
    video_title: meta.title,
    video_description: meta.description,
    visibility: 'unlisted',
    made_for_kids: false,
    upload_status: 'queued',
    processing_status: 'unknown',
    bytes_uploaded: 0,
    retry_count: 0,
    dedupe_key: `${job.id}:${driveFileId}`,
  });

  return { created: true, id: row.id, title: meta.title };
}