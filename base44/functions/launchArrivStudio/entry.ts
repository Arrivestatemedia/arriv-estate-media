import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Launches canonical Arriv Studio with real-estate context.
// Builds a signed SSO launch URL that Studio uses to authenticate the user
// and preload listing/property/agent context without a second login.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const {
      booking_id,
      job_id,
      template_id,
      creation_choice_id,
      asset_source,
      studio_section,
      embedded,
    } = body;

    const studioBaseUrl = secrets.get('ARRIV_STUDIO_BASE_URL');
    const ssoSecret = secrets.get('ARRIV_STUDIO_SSO_SECRET');

    if (!studioBaseUrl) {
      return Response.json({
        error: 'Arriv Studio is not yet configured. Please contact your administrator.',
      }, { status: 503 });
    }

    // Look up the customer's active Studio subscription
    const clientEmail = (user.email || '').toLowerCase();
    let subscription = null;
    try {
      const subs = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
        client_email: clientEmail,
        status: 'active',
      });
      subscription = subs && subs.length > 0 ? subs[0] : null;
    } catch (e) {
      // Subscription lookup is best-effort; Studio can still launch for one-time buyers
    }

    // Build listing/property context from booking or job if provided
    let listingContext = null;
    if (booking_id) {
      try {
        const booking = await base44.asServiceRole.entities.Booking.get(booking_id);
        if (booking) {
          listingContext = {
            source: 'estate_media_booking',
            booking_id: booking.id,
            property_address: booking.property_address || booking.location,
            package: booking.package,
            client_name: booking.client_name,
            client_email: booking.client_email,
          };
        }
      } catch (e) { /* best-effort */ }
    } else if (job_id) {
      try {
        const job = await base44.asServiceRole.entities.Job.get(job_id);
        if (job) {
          listingContext = {
            source: 'estate_media_job',
            job_id: job.id,
            property_address: job.location,
            title: job.title,
            package: job.package,
            client_name: job.client_name,
            client_email: job.client_email,
            delivered: job.delivery_status === 'delivered',
            google_drive_folder_url: job.google_drive_folder_url,
            final_edits_folder_url: job.final_edits_folder_url,
          };
        }
      } catch (e) { /* best-effort */ }
    }

    // Build the launch context
    const launchContext = {
      source_product: 'ESTATE_MEDIA',
      industry_context: 'REAL_ESTATE',
      organization_id: subscription?.organization_id || `estate_media_${clientEmail}`,
      user_email: clientEmail,
      user_name: user.full_name || user.email,
      subscription_plan: subscription?.plan_id || null,
      subscription_status: subscription?.status || null,
      production_minutes_remaining: subscription?.minutes_remaining ?? null,
      entitlement_overrides: subscription?.entitlement_overrides || null,
      listing_context: listingContext,
      template_id: template_id || null,
      creation_choice_id: creation_choice_id || null,
      asset_source: asset_source || 'my_estate_media',
      studio_section: studio_section || null,
      embedded: embedded === true,
      launched_at: new Date().toISOString(),
    };

    // Sign the context as a compact token (base64url of JSON + HMAC signature)
    const contextJson = JSON.stringify(launchContext);
    const encoder = new TextEncoder();
    const contextBytes = encoder.encode(contextJson);
    const contextB64 = btoa(String.fromCharCode(...contextBytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    let signature = '';
    if (ssoSecret) {
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(ssoSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(contextB64));
      signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    const launchUrl = `${studioBaseUrl.replace(/\/$/, '')}/launch?ctx=${contextB64}&sig=${signature}`;

    return Response.json({
      success: true,
      launch_url: launchUrl,
      context: launchContext,
      subscription: subscription ? {
        plan_id: subscription.plan_id,
        plan_name: subscription.plan_name,
        status: subscription.status,
        minutes_remaining: subscription.minutes_remaining,
      } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}