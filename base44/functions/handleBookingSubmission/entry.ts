import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { booking } = await req.json();

    if (!booking) {
      return Response.json({ error: 'Booking data is required' }, { status: 400 });
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const adminName = 'Bradley Burke';
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const isPastShoot = !!booking.past_shoot;

    // Create booking in database — auto-approve past shoots
    const createdBooking = await base44.asServiceRole.entities.Booking.create({
      ...booking,
      status: isPastShoot ? 'approved' : 'pending'
    });

    // Calculate canonical pricing via the authoritative engine and create a PricingSnapshot
    let canonicalPricing = null;
    let commissionableServiceValueCents = 0;
    try {
      const pricingRes = await base44.asServiceRole.functions.invoke('calculateFullMediaPricing', {
        package_id: booking.package,
        property_sqft: booking.property_sqft || null,
        add_on_ids: booking.add_ons || [],
        preferred_active: booking.preferred_active || false,
        approved_discount_amount: booking.approved_discount_amount || 0,
        referral_tender_amount: booking.referral_tender_amount || 0,
        contact_id: booking.contact_id || '',
        contact_email: booking.client_email || '',
        sales_member_id: booking.sales_member_id || '',
        payment_timing: booking.request_pay_at_closing ? 'pay_at_closing' : 'pay_up_front',
        property_address: propertyAddress,
        create_snapshot: true,
      });
      if (pricingRes?.data?.status === 'OK') {
        canonicalPricing = pricingRes.data;
        commissionableServiceValueCents = pricingRes.data.pricing?.commissionable_service_value || 0;
        await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
          pricing_snapshot_id: pricingRes.data.pricing_snapshot_id || '',
          property_pricing_tier: pricingRes.data.pricing?.property_pricing_tier || '',
          commissionable_service_value: commissionableServiceValueCents,
          preferred_discount: pricingRes.data.pricing?.preferred_discount || 0,
          approved_discount_amount: pricingRes.data.pricing?.approved_discount_amount || 0,
          referral_tender_amount: pricingRes.data.pricing?.referral_tender_amount || 0,
        });
      }
    } catch (pricingErr) {
      console.error('Canonical pricing calculation error:', pricingErr.message);
    }

    // If this booking came from a sales-rep invite, create a pending commission
    // tied to that rep. Uses the canonical commissionable_service_value from the
    // pricing engine when available; falls back to legacy total_price * 0.15.
    if (booking.sales_member_id) {
      try {
        let repData = null;
        try {
          const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: booking.sales_member_id });
          repData = reps && reps[0] ? reps[0] : null;
        } catch (e) { /* ignore */ }

        let commissionAmount;
        let commissionDescription;
        if (commissionableServiceValueCents > 0) {
          const compData = canonicalPricing?.compensation;
          commissionAmount = compData ? compData.sales_commission / 100 : 0;
          commissionDescription = `${compData?.sales_compensation_rule || 'Commission'} on ${booking.package} booking`;
        } else {
          const baseAmount = parseFloat(booking.total_price) || 0;
          commissionAmount = Math.round(baseAmount * 0.15 * 100) / 100;
          commissionDescription = `15% commission on ${booking.package} booking`;
        }
        if (commissionAmount > 0) {
          await base44.asServiceRole.entities.Commission.create({
            employee_id: booking.sales_member_id,
            employee_email: repData?.email || booking.sales_member_email || '',
            employee_name: repData?.full_name || booking.sales_member_name || '',
            payroll_employee_id: repData?.payroll_employee_id || '',
            compensation_type: 'commission',
            commission_plan_id: 'standard_15',
            deal_id: createdBooking.id,
            customer_name: booking.client_name,
            description: commissionDescription,
            gross_amount: commissionAmount,
            earned_date: new Date().toISOString().slice(0, 10),
            intended_pay_period: new Date().toISOString().slice(0, 7),
            approval_status: 'pending',
            payroll_status: 'not_sent',
            compensation_version: 1,
          });
        }
      } catch (commissionErr) {
        console.error('Commission creation error:', commissionErr.message);
      }
    }

    // For past shoots: create a Job assigned to admin (Bradley) and skip all client/admin notifications
    if (isPastShoot) {
      const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
      const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
      const addOnsTotal = (booking.add_ons || []).reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
      const payRate = (packagePrices[booking.package] || 0) + addOnsTotal;

      try {
        const now = new Date().toISOString();
        await base44.asServiceRole.entities.Job.create({
          title: `${booking.package} – ${propertyAddress}`,
          type: booking.package === 'mls_walkthrough' ? 'video' : (booking.package === 'photo_essentials' ? 'photo' : 'photo_video'),
          location: propertyAddress,
          date: booking.preferred_date,
          start_time: booking.preferred_time,
          pay_rate: payRate,
          client_price: parseFloat(booking.total_price),
          status: 'completed',
          production_status: 'no_editing_required',
          capture_status: 'captured',
          source_upload_status: 'complete',
          delivery_status: 'delivered',
          media_partner_fulfillment_status: 'completed',
          capture_fulfillment_completed_at: now,
          media_partner_status: 'job_completed',
          booked_by: adminEmail,
          booked_by_name: adminName,
          client_name: booking.client_name,
          client_email: booking.client_email,
          client_phone: booking.client_phone || '',
          package: booking.package,
          add_ons: booking.add_ons || [],
          notes: booking.notes || '',
          from_booking: true,
          booking_id: createdBooking.id,
          footage_uploaded: true,
          completed_at: now,
          delivered_to_customer: true,
          delivered_at: now,
        });
      } catch (jobErr) {
        console.error('Job creation error (past shoot):', jobErr.message);
      }

      // Skip to invoice generation — fall through to the invoice block below
    }

    // Send admin notification email via Gmail (skip for past shoots)
    if (!isPastShoot) try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const emailSubject = `New Booking Request - ${booking.client_name}`;
      const payAtClosingNote = booking.request_pay_at_closing ? '\n\n⚠️ CLIENT REQUESTED PAY-AT-CLOSING' : '';
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}${payAtClosingNote}\n\nView and manage this booking in your admin dashboard.`;

      const messageLines = [
        `To: ${adminEmail}`,
        `From: ${adminEmail}`,
        `Subject: ${emailSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        emailBody
      ];
      const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
        const merged = new Uint8Array(acc.length + part.length);
        merged.set(acc); merged.set(part, acc.length);
        return merged;
      }, new Uint8Array());
      const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64urlMessage })
      });

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email', recipient_type: 'admin', recipient_email: adminEmail,
        message_content: emailBody, subject: emailSubject,
        status: response.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Admin email error:', error);
    }

    // For pay-up-front: send booking confirmation email first (skip for past shoots)
    if (!booking.request_pay_at_closing) {
      // Send booking confirmation email via Gmail (skip for past shoots)
      if (!isPastShoot) try {
        const firstName = booking.client_name.split(' ')[0];
        const packageNames = { mls_walkthrough: 'MLS Walkthrough', photo_essentials: 'Photo Essentials Package', photo_cinematic: 'Photo + Cinematic Walkthrough', premium_bundle: 'Premium Bundle Package' };
        const addOnsList = (booking.add_ons || []).map(addon => {
          const addonDesc = { drone: 'Drone Photography', '3d_tour': '3D Virtual Tour', twilight: 'Twilight Photography', rush_delivery: 'Rush Delivery', vertical_reel: 'Vertical Reel', ai_staging: 'AI Staging' };
          return addonDesc[addon] || addon;
        }).join(', ');
        const packageAndAddons = addOnsList ? `${packageNames[booking.package]} + ${addOnsList}` : packageNames[booking.package];
        
        const confirmationHtmlBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>Thank you for your booking request!</p>
  <p>We've received your request for:</p>
  <ul style="line-height: 2;">
    <li><strong>Package:</strong> ${packageAndAddons}</li>
    <li><strong>Property:</strong> ${propertyAddress}</li>
    <li><strong>Preferred Date:</strong> ${booking.preferred_date}</li>
    <li><strong>Preferred Time:</strong> ${booking.preferred_time}</li>
    <li><strong>Total Price:</strong> $${booking.total_price}</li>
  </ul>
  <p>Once your invoice is paid, your booking will be confirmed.</p>
  <p>Thank you for choosing Arriv Estate Media!</p>
  <p>Best regards,<br><strong>Bradley Burke</strong><br>Arriv Estate Media<br>📞 678-242-9107<br>🌐 arrivestatemedia.com</p>
</body></html>`;
        
        const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const emailSubject = 'Your Booking Request Confirmation';
        const messageLines = [
          `To: ${booking.client_email}`, `From: ${adminEmail}`, `Subject: ${emailSubject}`,
          'MIME-Version: 1.0', 'Content-Type: text/html; charset="UTF-8"', '', confirmationHtmlBody
        ];
        const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
          const merged = new Uint8Array(acc.length + part.length);
          merged.set(acc); merged.set(part, acc.length);
          return merged;
        }, new Uint8Array());
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        console.log('Sending confirmation email via Gmail to:', booking.client_email);
        const gmailRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64urlMessage })
        });
        
        const gmailData = await gmailRes.json();
        console.log('Gmail response status:', gmailRes.status, 'data:', JSON.stringify(gmailData).substring(0, 200));
        
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: 'Booking confirmation sent', subject: emailSubject,
          status: gmailRes.ok ? 'success' : 'failed',
          error_message: gmailRes.ok ? null : JSON.stringify(gmailData)
        });
      } catch (error) {
        console.error('Confirmation email error:', error);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: 'Booking confirmation failed', subject: 'Your Booking Request Confirmation',
          status: 'failed', error_message: error.message
        });
      }

      // Send SMS to admin via Twilio (skip for past shoots)
      if (!isPastShoot) try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        const adminPhone = Deno.env.get('ADMIN_PHONE');
        const smsMessage = `NEW BOOKING REQUEST\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal: $${booking.total_price}`;

        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromPhone, To: adminPhone, Body: smsMessage }).toString(),
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms', recipient_type: 'admin', recipient_phone: adminPhone,
          message_content: smsMessage, status: smsResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Admin SMS error:', error);
      }

      // Generate and send invoice via the shared function (single source of truth)
      // If this fails, the safety-net workflow (Ensure Booking Invoices) will catch it
      try {
        await base44.asServiceRole.functions.invoke('generatePayUpFrontInvoice', {
          bookingId: createdBooking.id,
          booking,
          total_price: booking.total_price
        });

      } catch (invoiceError) {
        console.error('Invoice generation error:', invoiceError);
        // Safety-net workflow (Ensure Booking Invoices) will catch and retry
      }

    } else if (!isPastShoot) {
      // Pay-at-closing: send simple confirmation via Gmail (skip for past shoots)
      try {
        const exactPrice = commissionableServiceValueCents > 0
          ? `$${(commissionableServiceValueCents / 100).toFixed(2)}`
          : `$${booking.total_price}`;
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const emailSubject = 'Your Booking Request Confirmation';
        const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\nService Total: ${exactPrice}\n\nYour payment will be collected at closing. We'll be in touch to confirm the details.\n\nThank you!`;

        const messageLines = [
          `To: ${booking.client_email}`, `From: ${adminEmail}`, `Subject: ${emailSubject}`,
          'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', emailBody
        ];
        const messageBytes = messageLines.map(l => new TextEncoder().encode(l + '\r\n')).reduce((acc, part) => {
          const merged = new Uint8Array(acc.length + part.length);
          merged.set(acc); merged.set(part, acc.length);
          return merged;
        }, new Uint8Array());
        const base64urlMessage = btoa(String.fromCharCode(...messageBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64urlMessage })
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: emailBody, subject: emailSubject,
          status: response.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Pay-at-closing confirmation email error:', error);
      }

      // SMS to admin
      try {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        const adminPhone = Deno.env.get('ADMIN_PHONE');
        const exactPrice = commissionableServiceValueCents > 0
          ? `$${(commissionableServiceValueCents / 100).toFixed(2)}`
          : `$${booking.total_price}`;
        const smsMessage = `PAY-AT-CLOSING REQUESTED\n\nClient: ${booking.client_name}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nPackage: ${booking.package}\nTotal: ${exactPrice}`;

        const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: fromPhone, To: adminPhone, Body: smsMessage }).toString(),
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms', recipient_type: 'admin', recipient_phone: adminPhone,
          message_content: smsMessage, status: smsResponse.ok ? 'success' : 'failed'
        });
      } catch (error) {
        console.error('Admin SMS error:', error);
      }
    }

    // PATH A — BUNDLE: If the customer added a Studio subscription bundle at checkout,
    // activate the canonical Studio entitlement. Estate Media handles the transaction
    // with its existing commerce/payment architecture — no separate Studio checkout.
    if (booking.studio_bundle_plan) {
      try {
        const PLAN_DETAILS = {
          studio_creator: { name: 'Studio for Real Estate — Creator', priceCents: 4900, minutes: 5 },
          studio_pro: { name: 'Studio for Real Estate — Pro', priceCents: 9900, minutes: 15 },
          studio_brokerage: { name: 'Studio for Real Estate — Brokerage', priceCents: 24900, minutes: 40 },
        };
        const plan = PLAN_DETAILS[booking.studio_bundle_plan];
        if (plan) {
          const clientEmail = (booking.client_email || '').toLowerCase();
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const existing = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
            client_email: clientEmail,
            status: 'active',
          });

          if (existing && existing.length > 0) {
            const sub = existing[0];
            await base44.asServiceRole.entities.ArrivStudioSubscription.update(sub.id, {
              plan_id: booking.studio_bundle_plan,
              plan_name: plan.name,
              monthly_price_cents: plan.priceCents,
              production_minutes_per_month: plan.minutes,
              minutes_remaining: plan.minutes,
              minutes_used_this_period: 0,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            });
          } else {
            await base44.asServiceRole.entities.ArrivStudioSubscription.create({
              client_email: clientEmail,
              client_name: booking.client_name || '',
              organization_id: `estate_media_${clientEmail}`,
              plan_id: booking.studio_bundle_plan,
              plan_name: plan.name,
              monthly_price_cents: plan.priceCents,
              production_minutes_per_month: plan.minutes,
              minutes_remaining: plan.minutes,
              minutes_used_this_period: 0,
              status: 'active',
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              entitlement_overrides: null,
              created_at: now.toISOString(),
            });
          }
        }
      } catch (studioErr) {
        console.error('Studio bundle activation error:', studioErr.message);
      }
    }

    return Response.json({ success: true, booking: createdBooking });
  } catch (error) {
    console.error('Booking submission error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});