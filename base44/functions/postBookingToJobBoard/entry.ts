import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { ensureEditingTasksForJob } from '../../shared/editingQueueEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);

    // PAYOUT_V2: Calculate canonical provider payout via the compensation engine
    // instead of the legacy hardcoded contractor pricing table.
    let contractorPayRate = 0;
    let compensationResult = null;
    let pricingSnapshotId = booking.pricing_snapshot_id || '';
    let requiredCapabilities = [];
    try {
      const fullPricingRes = await base44.asServiceRole.functions.invoke('calculateFullMediaPricing', {
        package_id: booking.package,
        property_sqft: booking.property_sqft || null,
        add_on_ids: booking.add_ons || [],
        preferred_active: booking.preferred_active || false,
        approved_discount_amount: booking.approved_discount_amount || 0,
        referral_tender_amount: booking.referral_tender_amount || 0,
        contact_email: booking.client_email || '',
        sales_member_id: booking.sales_member_id || '',
        payment_timing: booking.request_pay_at_closing ? 'pay_at_closing' : 'pay_up_front',
        property_address: propertyAddress,
        create_snapshot: !pricingSnapshotId,
      });
      if (fullPricingRes?.data?.status === 'OK') {
        compensationResult = fullPricingRes.data.compensation;
        contractorPayRate = (compensationResult?.media_partner_payout || 0) / 100;
        requiredCapabilities = fullPricingRes.data.required_capabilities || [];
        if (!pricingSnapshotId) pricingSnapshotId = fullPricingRes.data.pricing_snapshot_id || '';
      }
    } catch (e) {
      console.error('Canonical pricing in postBookingToJobBoard:', e.message);
    }

    // Fallback to legacy hardcoded pricing if compensation engine fails
    if (contractorPayRate === 0) {
      const contractorPackagePricing = { 'mls_walkthrough': 60, 'photo_essentials': 150, 'photo_cinematic': 250, 'premium_bundle': 325 };
      const contractorAddonPricing = { 'drone': 60, '3d_tour': 60, 'twilight': 40, 'vertical_reel': 25, 'ai_staging': 0, 'rush_delivery': 0 };
      const packageRate = contractorPackagePricing[booking.package] || 0;
      let addonsTotal = 0;
      if (booking.add_ons && Array.isArray(booking.add_ons)) {
        addonsTotal = booking.add_ons.reduce((sum, addon) => sum + (contractorAddonPricing[addon] || 0), 0);
      }
      contractorPayRate = packageRate + addonsTotal;
    }

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Check if job already exists for this booking
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    
    if (!existingJobs || existingJobs.length === 0) {
      const newJob = await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        state: booking.state,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: 'open',
        production_status: 'awaiting_capture',
        capture_status: 'pending',
        source_upload_status: 'not_started',
        delivery_status: 'pending',
        media_partner_fulfillment_status: 'pending',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        required_capabilities: requiredCapabilities,
        pricing_snapshot_id: pricingSnapshotId,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone
      });

      // PAYOUT_V2: Create immutable ProviderCompensationSnapshot to freeze the payout
      if (compensationResult && newJob?.id) {
        try {
          const compSnapshot = await base44.asServiceRole.entities.ProviderCompensationSnapshot.create({
            job_id: newJob.id,
            booking_id: bookingId,
            provider_id: '',
            provider_name: '',
            package_id: booking.package,
            property_sqft: booking.property_sqft || null,
            property_pricing_tier: booking.property_pricing_tier || compensationResult.property_pricing_tier || 'TIER_1',
            pricing_rule_version: compensationResult.compensation_version || '',
            compensation_rule_version: compensationResult.compensation_version || '',
            commissionable_service_value_snapshot: compensationResult.commissionable_service_value || 0,
            sales_commission_snapshot: compensationResult.sales_commission || 0,
            provider_payout: compensationResult.media_partner_payout || 0,
            provider_compensation_rule: compensationResult.provider_compensation_rule || '',
            accepted_at: new Date().toISOString(),
          });
          await base44.asServiceRole.entities.Job.update(newJob.id, {
            provider_compensation_snapshot_id: compSnapshot.id,
          });
        } catch (e) {
          console.error('ProviderCompensationSnapshot creation error (postBookingToJobBoard):', e.message);
        }
      }

      // ── EDITING QUEUE INTEGRATION ──
      // Create EditingTasks at job creation time (WAITING_FOR_UPLOAD status).
      // Idempotent: if tasks already exist for this job, returns existing.
      // Tasks will be released to READY_FOR_EDITING when source media is uploaded.
      try {
        await ensureEditingTasksForJob(base44, newJob, 'system');
      } catch (editErr) {
        console.error('Editing task creation failed for job', newJob.id, ':', editErr.message);
      }
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email and calendar invite using existing functions
    try {
      await base44.asServiceRole.functions.invoke('sendBookingNotifications', { booking });
      await base44.asServiceRole.functions.invoke('createCalendarEvent', { booking });
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});