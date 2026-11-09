import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { loadMlsProviders, getProvider, validateMlsNumber, isSupportedPhoto, isProviderLiveForCustomers, type MlsProvider } from '../../shared/mlsProviders.ts';
import { loadMlsServiceWindow, computeMlsDeadline, formatEtDeadline, describeWindow } from '../../shared/mlsServiceWindow.ts';
import { ownsJob, isDeliveryReady, listDeliveryFiles, resolvePropertyAddress, resolvePropertyLocation } from '../../shared/mlsJobContext.ts';
import { loadMlsServiceRegions } from '../../shared/mlsRegions.ts';
import {
  resolveDestinationPlan,
  validateDestinationSelection,
  destinationIdempotencyKey,
  selectionKey,
  runDestinations,
  type MlsDestination,
  type MlsDestinationPlan,
} from '../../shared/mlsTerritories.ts';
import { buildBrightMediaSyncManifest } from '../../shared/brightMediaSync.ts';
import { submitBrightManifest } from '../../shared/brightSubmission.ts';
import { notifyAdminOfMlsRequest, resolveAppUrl } from '../../shared/mlsNotifications.ts';

/**
 * submitMlsUploadRequest
 * A customer asks Arriv to publish their selected delivered media to their MLS listing(s).
 *
 * Identity: the customer is verified server-side against the job's own client_email, exactly as the
 * delivery gallery and download endpoints already do.
 *
 * The MLS is never something the customer has to know. The property's address resolves the eligible
 * MLS systems (mlsTerritories). Exactly one → published there with no question asked. Several
 * overlapping systems → the customer chooses among ONLY those, and each choice becomes its own
 * independent publishing destination. An address that cannot be placed confidently goes to
 * administrative review instead of a guess.
 *
 * This creates requests only. No Job, Booking or delivery status is touched.
 */
const OPEN_STATUSES = ['submitted', 'processing', 'photos_uploaded', 'video_added', 'needs_attention'];

function reviewReasonFor(reason: string): string {
  switch (reason) {
    case 'jurisdiction_unknown':
      return 'The county or independent city could not be confirmed for this address — confirm which MLS serves it before publishing.';
    case 'coverage_unmapped':
      return 'Address is outside the mapped MLS service areas — assign the provider and publish, then add coverage.';
    case 'provider_not_advertised':
      return 'Coverage points to an MLS Arriv cannot publish to yet — confirm the destination before publishing.';
    case 'missing_location':
      return 'Property address could not be matched to an MLS service area — confirm coverage before publishing.';
    default:
      return 'Property address could not be matched to an MLS service area — confirm coverage before publishing.';
  }
}

function publicPlan(plan: MlsDestinationPlan) {
  return {
    status: plan.status,
    reason: plan.reason,
    basis: plan.basis,
    coverage_label: plan.coverage_label,
    jurisdiction_label: plan.jurisdiction_label,
    eligible: plan.eligible,
    selected: plan.selected,
    selection_policy: plan.selection_policy,
    candidate_provider_id: plan.candidate_provider_id,
    candidate_provider_label: plan.candidate_provider_label,
    message: plan.message,
    can_submit: plan.can_submit,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      jobId,
      clientEmail,
      mlsNumber,
      mlsNumbers = {},
      selectedProviders = [],
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

    if (!Array.isArray(selectedMedia) || selectedMedia.length === 0) {
      return Response.json({ error: 'Select the media you want published first.' }, { status: 400 });
    }

    // ---- automatic MLS detection ----
    const providers = await loadMlsProviders(base44);
    const propertyLocation = await resolvePropertyLocation(base44, job);
    const regions = await loadMlsServiceRegions(base44);
    const plan = resolveDestinationPlan(regions, providers, propertyLocation);

    const window = await loadMlsServiceWindow(base44);
    const submittedAt = new Date();
    const deadline = computeMlsDeadline(submittedAt, window);
    const deadlineLabel = formatEtDeadline(deadline);
    const windowLabel = describeWindow(window);
    const propertyAddress = await resolvePropertyAddress(base44, job);

    // ---- review: nothing supported claims this address confidently ----
    if (plan.status === 'review') {
      const attentionReason = reviewReasonFor(plan.reason);
      const requestId = `mls_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const reviewRequest = await base44.asServiceRole.entities.MlsUploadRequest.create({
        tenant_id: job.tenant_id || 'tnt_estate_media',
        request_id: requestId,
        job_id: jobId,
        booking_id: job.booking_id || '',
        provider: 'unresolved',
        region_label: plan.coverage_label || '',
        region_basis: plan.basis,
        region_resolution: {
          status: plan.status,
          reason: plan.reason,
          basis: plan.basis,
          provider_id: plan.candidate_provider_id || '',
          provider_live: false,
          region_id: '',
          region_label: plan.coverage_label || '',
          matches: [],
          location: propertyLocation,
        },
        mls_number_required: false,
        client_email: job.client_email,
        client_name: job.client_name || '',
        client_phone: job.client_phone || '',
        property_address: propertyAddress,
        selected_media: selectedMedia.map((m: any, idx: number) => ({
          drive_file_id: String(m?.id || ''),
          name: String(m?.name || ''),
          kind: m?.kind === 'video' ? 'video' : 'photo',
          position: idx + 1,
        })),
        authorization_confirmed: true,
        authorization_snapshot: String(authorizationText || '').slice(0, 2000),
        authorized_at: submittedAt.toISOString(),
        authorized_by_email: job.client_email,
        status: 'needs_attention',
        attention_reason: attentionReason,
        submitted_at: submittedAt.toISOString(),
        deadline_at: deadline ? deadline.toISOString() : null,
        status_history: [{
          status: 'needs_attention',
          at: submittedAt.toISOString(),
          actor: job.client_email,
          note: `Customer submitted from the delivery gallery — routed for MLS review (${plan.reason})`,
        }],
        duplicate_key: `${jobId}:unresolved:`,
      });

      try {
        const notified = await notifyAdminOfMlsRequest(base44, {
          request: reviewRequest,
          job,
          deadlineLabel,
          providerLabel: plan.candidate_provider_label || 'MLS review',
        });
        if (notified.emailed || notified.smsSent) {
          await base44.asServiceRole.entities.MlsUploadRequest.update(reviewRequest.id, {
            admin_notified_at: new Date().toISOString(),
          });
        }
      } catch (notifyError: any) {
        console.error('MLS admin notification failed:', notifyError?.message || notifyError);
      }

      const appUrl = await resolveAppUrl(base44);
      return Response.json({
        success: true,
        review_required: true,
        request: reviewRequest,
        results: [],
        plan: publicPlan(plan),
        destinations: [],
        provider_label: plan.candidate_provider_label || 'MLS review',
        deadline_label: deadlineLabel,
        window_label: windowLabel,
        next_step: 'Arriv will confirm which MLS serves this property before publishing.',
        gallery_url: `${appUrl}/ClientJobGallery?jobId=${jobId}`,
        unsupported_media: [],
      });
    }

    // ---- selection: only when more than one eligible system overlaps ----
    let destinations: MlsDestination[] = plan.eligible;
    if (plan.status === 'selection_required') {
      const selection = validateDestinationSelection(plan, selectedProviders);
      if (!selection.ok) {
        return Response.json({
          status: 'selection_required',
          error: selection.error,
          plan: publicPlan(plan),
        }, { status: 409 });
      }
      destinations = plan.eligible.filter((d) => selection.provider_ids.includes(d.provider_id));
    }

    // ---- a repeated submission of the same destinations is the same request ----
    const requestedKey = selectionKey(destinations.map((d) => d.provider_id));
    const priorGroups = await base44.asServiceRole.entities.MlsPublishingRequest.filter(
      { job_id: jobId }, '-submitted_at', 25,
    );
    const openGroup = (priorGroups || []).find((g: any) =>
      ['submitted', 'partial', 'review'].includes(String(g.status)) &&
      selectionKey(g.selected_provider_ids || []) === requestedKey);
    if (openGroup) {
      return Response.json({
        success: true,
        already_submitted: true,
        group: openGroup,
        group_id: openGroup.group_id,
        results: openGroup.destinations || [],
        plan: publicPlan(plan),
        destination_count: (openGroup.destinations || []).length,
        provider_label: (openGroup.destinations || [])[0]?.provider_label || '',
        deadline_label: deadlineLabel,
        window_label: windowLabel,
        next_step: 'This request is already with us — you can follow each MLS below in your gallery.',
        unsupported_media: [],
      });
    }

    // ---- delivery folder is the only allow-list ----
    const { files } = await listDeliveryFiles(base44, job);
    const byId = new Map(files.map((f) => [f.id, f]));
    const requestedIds = selectedMedia.map((m: any) => String(m?.id || '')).filter(Boolean);
    const missing = requestedIds.filter((id: string) => !byId.has(id));
    if (missing.length > 0) {
      return Response.json({ error: 'Some of the selected media is no longer available. Refresh the gallery and try again.' }, { status: 409 });
    }

    const ytRows = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ job_id: jobId }, '-created_date', 200);
    const youtubeByDriveId = new Map<string, string>();
    (ytRows || []).forEach((row: any) => {
      if (row.upload_status === 'ready' && row.youtube_url) youtubeByDriveId.set(String(row.drive_file_id), row.youtube_url);
    });

    const orderIndex = new Map<string, number>();
    (Array.isArray(photoOrder) ? photoOrder : []).forEach((id: any, idx: number) => orderIndex.set(String(id), idx));

    const existingRows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ job_id: jobId }, '-created_date', 50);

    /** Builds one destination's media exactly as that provider will receive it. */
    const buildMedia = (provider: MlsProvider) => {
      const unsupported: string[] = [];
      const photos: Array<{ drive_file_id: string; name: string; position: number }> = [];
      const videos: Array<{ drive_file_id: string; name: string; youtube_url: string }> = [];

      for (const item of selectedMedia) {
        const file = byId.get(String(item?.id));
        if (!file) continue;
        if (file.isImage) {
          if (!isSupportedPhoto(provider, file.name)) {
            unsupported.push(`${file.name} — ${provider.short_label} does not accept this photo format`);
            continue;
          }
          photos.push({ drive_file_id: file.id, name: file.name, position: 0 });
        } else if (file.isVideo) {
          const url = youtubeByDriveId.get(file.id);
          if (!url) {
            unsupported.push(`${file.name} — the unbranded video link is still being prepared, so it will not be added to the ${provider.short_label} listing yet`);
            continue;
          }
          videos.push({ drive_file_id: file.id, name: file.name, youtube_url: url });
        } else {
          unsupported.push(`${file.name} — this file type cannot be published to ${provider.short_label}`);
        }
      }

      // The customer's chosen order first, then anything selected after ordering.
      photos.sort((a, b) => {
        const ai = orderIndex.has(a.drive_file_id) ? orderIndex.get(a.drive_file_id)! : 10000;
        const bi = orderIndex.has(b.drive_file_id) ? orderIndex.get(b.drive_file_id)! : 10000;
        return ai - bi;
      });
      photos.forEach((p, idx) => { p.position = idx + 1; });
      return { photos, videos, unsupported };
    };

    const groupId = `mls_grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const submittedIso = submittedAt.toISOString();

    // ---- one isolated write per destination ----
    const results = await runDestinations(destinations, async (destination) => {
      const provider = getProvider(providers, destination.provider_id);
      if (!provider) throw new Error(`${destination.provider_label} is no longer available.`);

      // Listing number: per-destination when several MLS each need one.
      const rawNumber = String((mlsNumbers || {})[destination.provider_id] ?? mlsNumber ?? '').trim();
      const requiresListingNumber = provider.requires_listing_number !== false;
      let normalizedNumber = '';
      if (rawNumber) {
        const numberCheck = validateMlsNumber(provider, rawNumber);
        if (!numberCheck.valid) throw new Error(numberCheck.message);
        normalizedNumber = numberCheck.normalized;
      } else if (requiresListingNumber) {
        throw new Error(`Enter your ${provider.short_label} listing number.`);
      }

      const { photos, videos, unsupported } = buildMedia(provider);
      if (photos.length === 0 && videos.length === 0) {
        throw new Error(`None of the selected media can be published to ${provider.short_label} yet.`);
      }
      if (photos.length > destination.photo_limit) {
        throw new Error(`${provider.short_label} accepts up to ${destination.photo_limit} photographs per listing. You selected ${photos.length}.`);
      }

      // Idempotency: an already-open row for this MLS + listing is the same submission.
      const idempotencyKey = destinationIdempotencyKey(jobId, provider.id, normalizedNumber);
      const duplicate = (existingRows || []).find((r: any) =>
        destinationIdempotencyKey(r.job_id, r.provider, String(r.mls_number_normalized || r.mls_number || '')) === idempotencyKey &&
        OPEN_STATUSES.includes(String(r.status)));
      if (duplicate) {
        return {
          request_id: duplicate.request_id,
          row: duplicate,
          duplicate: true,
          bright: null,
          unsupported,
          photo_count: photos.length,
          video_count: videos.length,
        };
      }

      const requestId = `mls_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mediaPayload = [
        ...photos.map((p) => ({ drive_file_id: p.drive_file_id, name: p.name, kind: 'photo', position: p.position })),
        ...videos.map((v, idx) => ({ drive_file_id: v.drive_file_id, name: v.name, kind: 'video', position: photos.length + idx + 1, youtube_url: v.youtube_url })),
      ];

      // Bright Media Sync manifest: recorded at submission, transmitted only once certified + enabled.
      const manifestStatus = provider.id === 'bright_mls'
        ? (isProviderLiveForCustomers(provider) ? 'generated' : 'blocked_pending_certification')
        : 'not_applicable';
      let providerManifest: any = null;
      let manifestChecksum = '';
      if (provider.id === 'bright_mls') {
        const region = regions.find((r: any) => r.id === destination.region_id) || null;
        const built = await buildBrightMediaSyncManifest({
          requestId,
          provider: { id: provider.id, label: provider.label, short_label: provider.short_label },
          region,
          location: propertyLocation,
          job,
          listingNumber: normalizedNumber,
          media: mediaPayload.map((m: any) => ({ ...m })),
          authorization: {
            confirmed: true,
            at: submittedIso,
            by_email: job.client_email,
            snapshot: String(authorizationText || '').slice(0, 2000),
          },
        });
        providerManifest = built.manifest;
        manifestChecksum = built.checksum;
      }

      const row = await base44.asServiceRole.entities.MlsUploadRequest.create({
        tenant_id: job.tenant_id || 'tnt_estate_media',
        request_id: requestId,
        job_id: jobId,
        booking_id: job.booking_id || '',
        provider: provider.id,
        region_id: destination.region_id,
        region_label: destination.region_label,
        region_basis: destination.basis,
        region_resolution: {
          status: plan.status,
          reason: plan.reason,
          basis: destination.basis,
          provider_id: provider.id,
          provider_live: isProviderLiveForCustomers(provider),
          region_id: destination.region_id,
          region_label: destination.region_label,
          matches: [],
          location: propertyLocation,
        },
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
        selected_media: mediaPayload,
        selected_photo_ids: photos.map((p) => p.drive_file_id),
        selected_video_ids: videos.map((v) => v.drive_file_id),
        selected_photo_order: photos.map((p) => p.drive_file_id),
        selected_youtube_urls: videos.map((v) => v.youtube_url),
        photo_count: photos.length,
        video_count: videos.length,
        unsupported_media: unsupported,
        authorization_confirmed: true,
        authorization_snapshot: String(authorizationText || '').slice(0, 2000),
        authorized_at: submittedIso,
        authorized_by_email: job.client_email,
        status: 'submitted',
        attention_reason: manifestStatus === 'blocked_pending_certification'
          ? `${provider.short_label} publishing is not certified yet — publish this request by hand.`
          : '',
        photo_upload_status: photos.length > 0 ? 'pending' : 'not_required',
        video_upload_status: videos.length > 0 ? 'pending' : 'not_required',
        submitted_at: submittedIso,
        deadline_at: deadline ? deadline.toISOString() : null,
        status_history: [{
          status: 'submitted',
          at: submittedIso,
          actor: job.client_email,
          note: `Customer submitted from the delivery gallery — ${destination.publishing_mode === 'automatic'
            ? `transmitted to ${provider.label}`
            : `queued for the MLS team to publish to ${provider.label}`}`,
        }],
        duplicate_key: idempotencyKey,
      });

      // Automated transmission only for a live, certified route. Never for a dark one.
      let bright: any = null;
      let finalRow = row;
      if (provider.id === 'bright_mls' && isProviderLiveForCustomers(provider)) {
        try {
          bright = await submitBrightManifest(base44, row, false);
          if (bright?.request) finalRow = bright.request;
        } catch (sendError: any) {
          console.error('Bright manifest submission failed:', sendError?.message || sendError);
          bright = { outcome: 'error', message: 'The Bright link could not be created.' };
        }
      }

      return {
        request_id: requestId,
        row: finalRow,
        duplicate: false,
        bright,
        unsupported,
        photo_count: photos.length,
        video_count: videos.length,
      };
    });

    const succeeded = results.filter((r) => r.ok && r.value);
    const failed = results.filter((r) => !r.ok);

    if (succeeded.length === 0) {
      return Response.json({
        success: false,
        error: failed[0]?.error || 'Could not submit the MLS request',
        results: results.map((r) => ({
          provider_id: r.provider_id,
          provider_label: r.provider_label,
          ok: r.ok,
          error: r.error,
        })),
        plan: publicPlan(plan),
      }, { status: 400 });
    }

    const destinationRecords = results.map((r: any) => ({
      provider_id: r.provider_id,
      provider_label: r.provider_label,
      publishing_mode: r.publishing_mode,
      request_id: r.ok ? r.value?.request_id || '' : '',
      status: r.ok ? (r.value?.duplicate ? 'duplicate' : 'submitted') : 'failed',
      manifest_id: r.ok ? r.value?.bright?.manifest_id || '' : '',
      import_url: r.ok ? r.value?.bright?.import_url || '' : '',
      error: r.ok ? '' : r.error || 'This MLS could not be submitted',
    }));

    const groupStatus = failed.length > 0 ? 'partial' : 'submitted';
    let group: any = null;
    try {
      group = await base44.asServiceRole.entities.MlsPublishingRequest.create({
        group_id: groupId,
        tenant_id: job.tenant_id || 'tnt_estate_media',
        job_id: jobId,
        booking_id: job.booking_id || '',
        client_email: job.client_email,
        client_name: job.client_name || '',
        property_address: propertyAddress,
        property_location: propertyLocation as any,
        plan_status: plan.status,
        plan_reason: plan.reason,
        coverage_label: plan.coverage_label || '',
        jurisdiction_label: plan.jurisdiction_label || '',
        selection_policy: plan.selection_policy || '',
        selected_provider_ids: destinations.map((d) => d.provider_id),
        auto_selected: plan.status === 'auto',
        destinations: destinationRecords,
        status: groupStatus,
        review_required: false,
        mls_numbers: mlsNumbers || {},
        authorization_snapshot: String(authorizationText || '').slice(0, 2000),
        authorized_by_email: job.client_email,
        submitted_at: submittedIso,
      });
    } catch (groupError: any) {
      // The destinations already exist; losing the summary must never lose the publishing work.
      console.error('MLS publishing group record failed:', groupError?.message || groupError);
    }

    const firstCreated = succeeded[0]?.value;
    const providerLabel = destinations.map((d) => d.short_label).join(' + ');
    try {
      const notified = await notifyAdminOfMlsRequest(base44, {
        request: firstCreated?.row,
        job,
        deadlineLabel,
        providerLabel,
      });
      if ((notified.emailed || notified.smsSent) && group?.id) {
        await base44.asServiceRole.entities.MlsPublishingRequest.update(group.id, {
          admin_notified_at: new Date().toISOString(),
        });
      }
    } catch (notifyError: any) {
      console.error('MLS admin notification failed:', notifyError?.message || notifyError);
    }

    const appUrl = await resolveAppUrl(base44);
    const importLinks = destinationRecords
      .filter((d) => d.import_url)
      .map((d) => ({ provider_id: d.provider_id, provider_label: d.provider_label, url: d.import_url }));
    const anyAutomatic = destinationRecords.some((d) => d.import_url);
    const unsupported = Array.from(new Set(succeeded.flatMap((r: any) => r.value?.unsupported || [])));

    return Response.json({
      success: true,
      group_id: groupId,
      group,
      request: firstCreated?.row || null,
      results: destinationRecords,
      plan: publicPlan(plan),
      destinations: destinations,
      destination_count: destinations.length,
      auto_selected: plan.status === 'auto',
      provider_label: providerLabel,
      deadline_label: deadlineLabel,
      window_label: windowLabel,
      bright: firstCreated?.bright
        ? {
          outcome: firstCreated.bright.outcome,
          manifest_id: firstCreated.bright.manifest_id || null,
          import_url: firstCreated.bright.import_url || null,
        }
        : null,
      import_links: importLinks,
      failed_destinations: destinationRecords.filter((d) => d.status === 'failed'),
      next_step: failed.length > 0
        ? `Published to ${destinationRecords.filter((d) => d.status !== 'failed').map((d) => d.provider_label).join(', ') || 'none'}. ${failed.map((f) => f.short_label).join(', ')} needs our team — we are on it.`
        : anyAutomatic
          ? 'Open the Bright link to add your photos to your listing.'
          : `Arriv will publish through ${providerLabel} for you.`,
      gallery_url: `${appUrl}/ClientJobGallery?jobId=${jobId}`,
      unsupported_media: unsupported,
    });
  } catch (error: any) {
    console.error('submitMlsUploadRequest error:', error);
    return Response.json({ error: error?.message || 'Could not submit the MLS request' }, { status: 500 });
  }
});