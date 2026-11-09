import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { loadMlsProviders, getProvider, validateMlsNumber, isSupportedPhoto, isProviderLiveForCustomers } from '../../shared/mlsProviders.ts';
import { loadMlsServiceWindow, computeMlsDeadline, formatEtDeadline, describeWindow } from '../../shared/mlsServiceWindow.ts';
import { ownsJob, isDeliveryReady, listDeliveryFiles, resolvePropertyAddress, resolvePropertyLocation } from '../../shared/mlsJobContext.ts';
import { loadMlsServiceRegions, resolveMlsRegion } from '../../shared/mlsRegions.ts';
import { buildBrightMediaSyncManifest } from '../../shared/brightMediaSync.ts';
import { notifyAdminOfMlsRequest, resolveAppUrl } from '../../shared/mlsNotifications.ts';

/**
 * submitMlsUploadRequest
 * A customer asks Arriv to publish their selected delivered media to their MLS listing.
 *
 * Identity: the customer is verified server-side against the job's own client_email, exactly as
 * the delivery gallery and download endpoints already do. A client-supplied email is never
 * trusted on its own — the job record decides whether the caller may act for it.
 *
 * This creates a request only. No Job, Booking or delivery status is touched: MLS upload state is
 * independent of the delivery pipeline.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    // The customer never chooses an MLS. Any provider sent by the browser is ignored: the property's
    // own service area decides, server-side, exactly as the gallery displayed it.
    const {
      jobId,
      clientEmail,
      mlsNumber,
      selectedMedia = [],
      photoOrder = [],
      authorizationConfirmed,
      authorizationText,
    } = body || {};

    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    if (!clientEmail) return Response.json({ error: 'clientEmail is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    if (!ownsJob(job, clientEmail)) {
      return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
    }

    if (!isDeliveryReady(job)) {
      return Response.json({ error: 'This delivery is not ready to publish yet' }, { status: 409 });
    }

    if (authorizationConfirmed !== true) {
      return Response.json({ error: 'You must confirm you are authorized to request uploads to this listing.' }, { status: 400 });
    }

    // ---- automatic regional routing ----
    const providers = await loadMlsProviders(base44);
    const propertyLocation = await resolvePropertyLocation(base44, job);
    const regions = await loadMlsServiceRegions(base44);
    const resolution = resolveMlsRegion(regions, propertyLocation, (id: string) =>
      isProviderLiveForCustomers(providers[id] || null));

    // Every address has an MLS route. When the map cannot name the provider yet the request is still
    // accepted and queued for our MLS team, so a customer is never turned away.
    const provider = resolution.provider_id ? getProvider(providers, resolution.provider_id) : null;
    const providerLabel = provider?.label || 'MLS review';
    const providerShortLabel = provider?.short_label || 'the MLS';
    const photoLimit = provider?.photo_limit ?? 200;

    // Review cases and unresolved areas carry no provider; they are queued for an administrator.
    const resolvedProviderId = resolution.status === 'review' || !provider ? 'unresolved' : provider.id;
    const reviewNeeded = resolution.status === 'review';

    // A listing number is only required where the provider actually needs one (FMLS). Where the
    // provider matches the listing by property address (Bright MLS), it is optional.
    const rawNumber = String(mlsNumber || '').trim();
    const requiresListingNumber = !!provider && provider.requires_listing_number !== false;
    let normalizedNumber = '';
    if (rawNumber) {
      const numberCheck = validateMlsNumber(provider, rawNumber);
      if (!numberCheck.valid) return Response.json({ error: numberCheck.message }, { status: 400 });
      normalizedNumber = numberCheck.normalized;
    } else if (requiresListingNumber) {
      return Response.json({
        error: `Enter your ${provider ? provider.short_label : 'MLS'} listing number.`,
      }, { status: 400 });
    }

    if (!Array.isArray(selectedMedia) || selectedMedia.length === 0) {
      return Response.json({ error: 'Select the media you want published first.' }, { status: 400 });
    }

    // The delivery folder is the only allow-list: a file must already be in this job.
    const { files } = await listDeliveryFiles(base44, job);
    const byId = new Map(files.map((f) => [f.id, f]));

    const requestedIds = selectedMedia.map((m: any) => String(m?.id || '')).filter(Boolean);
    const missing = requestedIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      return Response.json({ error: 'Some of the selected media is no longer available. Refresh the gallery and try again.' }, { status: 409 });
    }

    // Ready unbranded YouTube links, keyed by the Drive file they came from.
    const ytRows = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ job_id: jobId }, '-created_date', 200);
    const youtubeByDriveId = new Map<string, string>();
    (ytRows || []).forEach((row: any) => {
      if (row.upload_status === 'ready' && row.youtube_url) youtubeByDriveId.set(String(row.drive_file_id), row.youtube_url);
    });

    const unsupported: string[] = [];
    const photos: Array<{ drive_file_id: string; name: string; position: number }> = [];
    const videos: Array<{ drive_file_id: string; name: string; youtube_url: string }> = [];

    for (const item of selectedMedia) {
      const file = byId.get(String(item.id));
      if (!file) continue;
      if (file.isImage) {
        if (!isSupportedPhoto(provider, file.name)) {
          unsupported.push(`${file.name} — ${providerShortLabel} does not accept this photo format`);
          continue;
        }
        photos.push({ drive_file_id: file.id, name: file.name, position: 0 });
      } else if (file.isVideo) {
        const url = youtubeByDriveId.get(file.id);
        if (!url) {
          unsupported.push(`${file.name} — the unbranded video link is still being prepared, so it will not be added to the listing yet`);
          continue;
        }
        videos.push({ drive_file_id: file.id, name: file.name, youtube_url: url });
      } else {
        unsupported.push(`${file.name} — this file type cannot be published to ${providerShortLabel}`);
      }
    }

    if (photos.length === 0 && videos.length === 0) {
      return Response.json({
        error: 'None of the selected media can be published to this MLS yet. Select photographs, or wait for the video link to finish preparing.',
      }, { status: 400 });
    }

    if (photos.length > photoLimit) {
      return Response.json({
        error: `${providerShortLabel} accepts up to ${photoLimit} photographs per listing. You selected ${photos.length}.`,
      }, { status: 400 });
    }

    // Preserve the customer's chosen order, then any photos they selected after ordering.
    const orderIndex = new Map<string, number>();
    (Array.isArray(photoOrder) ? photoOrder : []).forEach((id: any, idx: number) => orderIndex.set(String(id), idx));
    photos.sort((a, b) => {
      const ai = orderIndex.has(a.drive_file_id) ? orderIndex.get(a.drive_file_id)! : 10000;
      const bi = orderIndex.has(b.drive_file_id) ? orderIndex.get(b.drive_file_id)! : 10000;
      return ai - bi;
    });
    photos.forEach((p, idx) => { p.position = idx + 1; });

    // One open request per job + provider + listing. A correction is legitimate once the previous
    // request is completed or cancelled, so only truly open states block.
    const openStatuses = ['submitted', 'processing', 'photos_uploaded', 'video_added', 'needs_attention'];
    const existing = await base44.asServiceRole.entities.MlsUploadRequest.filter({ job_id: jobId }, '-created_date', 50);
    const duplicate = (existing || []).find((r: any) =>
      r.provider === resolvedProviderId &&
      String(r.mls_number_normalized || r.mls_number || '') === normalizedNumber &&
      openStatuses.includes(String(r.status)),
    );
    if (duplicate) {
      return Response.json({
        error: 'An upload request for this listing is already open. You can follow its progress in your gallery.',
        existing_request_id: duplicate.request_id,
      }, { status: 409 });
    }

    const window = await loadMlsServiceWindow(base44);
    const submittedAt = new Date();
    const deadline = computeMlsDeadline(submittedAt, window);
    const propertyAddress = await resolvePropertyAddress(base44, job);

    const selectedMediaPayload = [
      ...photos.map((p) => ({ drive_file_id: p.drive_file_id, name: p.name, kind: 'photo', position: p.position })),
      ...videos.map((v, idx) => ({ drive_file_id: v.drive_file_id, name: v.name, kind: 'video', position: photos.length + idx + 1, youtube_url: v.youtube_url })),
    ];

    const requestId = `mls_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Bright Media Sync manifest: built at submission so the request always describes exactly the
    // media the customer chose, in their order. It is RECORDED, never transmitted, until Bright's
    // authentication, manifest, media-accessibility and authorized-import tests have all passed.
    const manifestStatus = provider?.id === 'bright_mls'
      ? (isProviderLiveForCustomers(provider) ? 'generated' : 'blocked_pending_certification')
      : 'not_applicable';
    let providerManifest: any = null;
    let manifestChecksum = '';
    if (provider?.id === 'bright_mls') {
      const region = regions.find((r: any) => r.id === resolution.region_id) || null;
      const built = await buildBrightMediaSyncManifest({
        requestId,
        provider: { id: provider.id, label: provider.label, short_label: provider.short_label },
        region,
        location: propertyLocation,
        job,
        listingNumber: normalizedNumber,
        media: selectedMediaPayload.map((m: any) => ({ ...m })),
        authorization: {
          confirmed: true,
          at: submittedAt.toISOString(),
          by_email: job.client_email,
          snapshot: String(authorizationText || '').slice(0, 2000),
        },
      });
      providerManifest = built.manifest;
      manifestChecksum = built.checksum;
    }

    // An ambiguous address, overlapping coverage or an unverified service area is queued for an
    // administrator to decide. The customer is never asked to pick a provider.
    const reviewReason = reviewNeeded
      ? (resolution.reason === 'overlapping_coverage'
        ? 'Overlapping MLS coverage for this address — confirm which provider serves it before publishing.'
        : resolution.reason === 'region_unverified'
          ? 'MLS service area not yet verified for this address — confirm coverage before publishing.'
          : resolution.reason === 'coverage_unmapped'
            ? 'Address is outside the mapped MLS service areas — assign the provider and publish, then add coverage.'
            : 'Property address could not be matched to an MLS service area — confirm coverage before publishing.')
      : (manifestStatus === 'blocked_pending_certification'
        ? 'Bright Media Sync is not certified yet — publish this request by hand.'
        : '');
    const initialStatus = reviewNeeded ? 'needs_attention' : 'submitted';

    const created = await base44.asServiceRole.entities.MlsUploadRequest.create({
      tenant_id: job.tenant_id || 'tnt_estate_media',
      request_id: requestId,
      job_id: jobId,
      booking_id: job.booking_id || '',
      provider: resolvedProviderId,
      region_id: resolution.region_id || '',
      region_label: resolution.region_label || '',
      region_basis: resolution.basis,
      region_resolution: resolution as any,
      mls_number_required: requiresListingNumber,
      mls_number: normalizedNumber,
      mls_number_normalized: normalizedNumber,
      manifest_status: manifestStatus,
      provider_manifest: providerManifest,
      manifest_checksum: manifestChecksum,
      client_email: job.client_email,
      client_name: job.client_name || '',
      client_phone: job.client_phone || '',
      property_address: propertyAddress,
      selected_media: selectedMediaPayload,
      selected_photo_ids: photos.map((p) => p.drive_file_id),
      selected_video_ids: videos.map((v) => v.drive_file_id),
      selected_photo_order: photos.map((p) => p.drive_file_id),
      selected_youtube_urls: videos.map((v) => v.youtube_url),
      photo_count: photos.length,
      video_count: videos.length,
      unsupported_media: unsupported,
      authorization_confirmed: true,
      authorization_snapshot: String(authorizationText || '').slice(0, 2000),
      authorized_at: submittedAt.toISOString(),
      authorized_by_email: job.client_email,
      status: initialStatus,
      attention_reason: reviewReason,
      photo_upload_status: photos.length > 0 ? 'pending' : 'not_required',
      video_upload_status: videos.length > 0 ? 'pending' : 'not_required',
      submitted_at: submittedAt.toISOString(),
      deadline_at: deadline ? deadline.toISOString() : null,
      status_history: [{
        status: initialStatus,
        at: submittedAt.toISOString(),
        actor: job.client_email,
        note: reviewNeeded
          ? `Customer submitted from the delivery gallery — routed for MLS review (${resolution.reason})`
          : `Customer submitted from the delivery gallery — routed automatically to ${providerLabel}`,
      }],
      duplicate_key: `${jobId}:${resolvedProviderId}:${normalizedNumber}`,
    });

    const deadlineLabel = formatEtDeadline(deadline);
    try {
      const notified = await notifyAdminOfMlsRequest(base44, {
        request: created,
        job,
        deadlineLabel,
        providerLabel,
      });
      if (notified.emailed || notified.smsSent) {
        await base44.asServiceRole.entities.MlsUploadRequest.update(created.id, {
          admin_notified_at: new Date().toISOString(),
        });
      }
    } catch (notifyError: any) {
      // The request exists regardless — a notification failure must never lose the task.
      console.error('MLS admin notification failed:', notifyError?.message || notifyError);
    }

    const appUrl = await resolveAppUrl(base44);

    return Response.json({
      success: true,
      request: created,
      deadline_label: deadlineLabel,
      window_label: describeWindow(window),
      provider_label: providerLabel,
      routing: resolution,
      next_step: reviewNeeded
        ? 'Arriv will confirm which MLS serves this property before publishing.'
        : manifestStatus === 'blocked_pending_certification'
          ? 'Arriv will publish this one for you while the automated route is finishing activation.'
          : `Arriv will publish through ${providerLabel}.`,
      gallery_url: `${appUrl}/ClientJobGallery?jobId=${jobId}`,
      unsupported_media: unsupported,
    });
  } catch (error: any) {
    console.error('submitMlsUploadRequest error:', error);
    return Response.json({ error: error?.message || 'Could not submit the MLS request' }, { status: 500 });
  }
});