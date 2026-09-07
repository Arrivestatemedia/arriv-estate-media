import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Add 1 day to the booking date to fix timezone shift
    const dateObj = new Date(booking.preferred_date);
    dateObj.setDate(dateObj.getDate() + 1);
    const adjustedDate = dateObj.toISOString().split('T')[0];

    // Get admin's phone from environment variable
    const adminPhone = Deno.env.get('ADMIN_PHONE') || '';

    // Calculate canonical pricing + compensation for this booking
    let providerPayoutDollars = parseFloat(booking.total_price) || 0;
    let requiredCapabilities = [];
    let pricingSnapshotId = booking.pricing_snapshot_id || '';
    let compensationSnapshotId = '';
    let compensationResult = null;
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
        providerPayoutDollars = (compensationResult?.media_partner_payout || 0) / 100;
        requiredCapabilities = fullPricingRes.data.required_capabilities || [];
        if (!pricingSnapshotId) pricingSnapshotId = fullPricingRes.data.pricing_snapshot_id || '';
      }
    } catch (e) {
      console.error('Canonical pricing in acceptBookingForMyself:', e.message);
    }

    const jobType = booking.package === 'mls_walkthrough' ? 'video'
      : (booking.package === 'photo_essentials' ? 'photo' : 'photo_video');

    await base44.asServiceRole.entities.Job.create({
      title: `${booking.package} - ${propertyAddress}`,
      type: jobType,
      description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
      location: propertyAddress,
      date: adjustedDate,
      start_time: booking.preferred_time,
      duration_hours: 2,
      pay_rate: providerPayoutDollars,
      client_price: parseFloat(booking.total_price),
      status: 'booked',
      booked_by: user.email,
      booked_by_name: user.full_name,
      booked_by_phone: adminPhone,
      client_name: booking.client_name,
      client_email: booking.client_email,
      client_phone: booking.client_phone,
      from_booking: true,
      booking_id: bookingId,
      package: booking.package,
      add_ons: booking.add_ons || [],
      required_capabilities: requiredCapabilities,
      pricing_snapshot_id: pricingSnapshotId,
    });

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Get the created job ID
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    const jobId = jobs?.[0]?.id;
    const job = jobs?.[0];

    // Create immutable ProviderCompensationSnapshot with the guaranteed payout
    if (jobId && compensationResult) {
      try {
        const compSnapshot = await base44.asServiceRole.entities.ProviderCompensationSnapshot.create({
          job_id: jobId,
          booking_id: bookingId,
          provider_id: '',
          provider_name: user.full_name || '',
          package_id: booking.package,
          property_sqft: booking.property_sqft || null,
          property_pricing_tier: booking.property_pricing_tier || 'TIER_1',
          pricing_rule_version: compensationResult.compensation_version || '',
          compensation_rule_version: compensationResult.compensation_version || '',
          commissionable_service_value_snapshot: compensationResult.commissionable_service_value || 0,
          sales_commission_snapshot: compensationResult.sales_commission || 0,
          provider_payout: compensationResult.media_partner_payout || 0,
          provider_compensation_rule: compensationResult.provider_compensation_rule || '',
          accepted_at: new Date().toISOString(),
        });
        compensationSnapshotId = compSnapshot.id;
        await base44.asServiceRole.entities.Job.update(jobId, {
          provider_compensation_snapshot_id: compensationSnapshotId,
        });
      } catch (e) {
        console.error('ProviderCompensationSnapshot creation error:', e.message);
      }
    }

    // Create Google Drive folder for the job
    let folderUrl = null;
    if (job) {
      try {
        const folderResult = await base44.asServiceRole.functions.invoke('createGoogleDriveFolderForJob', {
          jobAddress: propertyAddress,
          mediaPartnerEmail: user.email,
        });
        folderUrl = folderResult.data?.folderUrl;
        console.log('Google Drive folder created:', folderUrl);

        // Update job with Google Drive folder URL
        await base44.asServiceRole.entities.Job.update(jobId, {
          google_drive_folder_url: folderUrl
        });
      } catch (error) {
        console.error('Failed to create Google Drive folder:', error.message);
      }
    }

    // Send approval email and calendar invite using existing functions
    try {
      await base44.asServiceRole.functions.invoke('sendBookingNotifications', { booking });
      await base44.asServiceRole.functions.invoke('createCalendarEvent', { booking });
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    // Generate and send pay-up-front invoice
    if (!booking.request_pay_at_closing) {
      try {
        await base44.asServiceRole.functions.invoke('generatePayUpFrontInvoice', { bookingId });
      } catch (error) {
        console.error('Failed to generate invoice:', error.message);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});