import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveMarketplaceSalesRep } from '../../shared/payoutV2.ts';
import { assertVipWalletRedemption } from '../../shared/autoFundVipEnforcement.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
import { requireCustomer } from '../../shared/customerSession.ts';
import { authorizeOrderContext } from '../../shared/customerPurchasingContext.ts';
import {
  reserveB2BMediaCredits,
  reserveB2BCapacity,
  resolveB2BBookingEntitlementRequirement,
} from '../../shared/b2bEntitlementEngine.ts';

// Determine which funding program backs the wallet balance being redeemed.
// Auto-Fund issues 'reload' credit lots; Prepaid purchases issue 'purchase' lots.
// Used only for the disclosure label — commission suppression keys on wallet usage.
async function resolveWalletFundingSource(base44, walletId) {
  if (!walletId) return 'none';
  try {
    const res = await base44.asServiceRole.entities.CreditLot.filter({ wallet_id: walletId }, undefined, 200);
    const lots = Array.isArray(res) ? res : (res?.data || []);
    const hasReload = lots.some(l => l.source === 'reload');
    const hasPurchase = lots.some(l => l.source === 'purchase');
    if (hasReload && hasPurchase) return 'mixed';
    if (hasReload) return 'auto_fund';
    if (hasPurchase) return 'prepaid';
    return 'none';
  } catch {
    return 'none';
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { booking } = body || {};

    if (!booking) {
      return Response.json({ error: 'Booking data is required' }, { status: 400 });
    }

    // ── Purchasing context: personal, or a company the person is authorized for ─
    // The choice must be explicit. A company order is refused outright rather than
    // silently falling back to a personal wallet or to another organization.
    const requestedContext = booking.purchasing_context;
    const requestedOrgId =
      requestedContext && typeof requestedContext === 'object'
        ? requestedContext.organization_id || ''
        : typeof requestedContext === 'string' && requestedContext.startsWith('org:')
        ? requestedContext.slice(4)
        : '';
    const wantsOrganization = !!requestedOrgId;

    const orderingEmail = String(booking.client_email || '').trim().toLowerCase();
    let orderContext: any = { type: 'personal', credit_source: 'personal' };
    let membershipAccount: any = null;

    if (wantsOrganization) {
      const auth = await requireCustomer(base44, req, body);
      if (!auth.ok) {
        return Response.json(
          { error: auth.error, code: 'SESSION_REQUIRED' },
          { status: auth.status }
        );
      }
      if (auth.actor.email !== orderingEmail) {
        return Response.json(
          {
            error: 'A company order must be placed by the signed-in customer.',
            code: 'ORDERING_IDENTITY_MISMATCH',
          },
          { status: 403 }
        );
      }

      membershipAccount = auth.record;
      const evaluated = await authorizeOrderContext(base44.asServiceRole, {
        account: membershipAccount,
        organization_id: requestedOrgId,
      });

      if (!evaluated?.authorized || !evaluated?.can_order) {
        return Response.json(
          {
            error: evaluated?.reason || 'You cannot order for this organization.',
            code: evaluated?.code || 'ORGANIZATION_CONTEXT_REFUSED',
          },
          { status: 403 }
        );
      }

      // A company order with an empty credit pool is refused before anything is
      // created — never silently converted into a personal or cash order.
      if (
        evaluated.credits?.source === 'b2b_media_credit' &&
        Number(evaluated.credits?.available_units || 0) <= 0
      ) {
        return Response.json(
          {
            error: `${evaluated.organization_name} has no media credits available right now. Order personally, or contact your organization administrator.`,
            code: 'INSUFFICIENT_COMPANY_CREDITS',
          },
          { status: 409 }
        );
      }

      orderContext = evaluated;
    }

    const adminEmail = 'BradCBurke@arrivestatemedia.com';
    const adminName = 'Bradley Burke';
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
    const isPastShoot = !!booking.past_shoot;

    // ── Wallet-funded classification (reliable server-side, NOT a UI-only check) ─
    // Auto-Fund and Prepaid redemptions must NOT generate a booking-level sales
    // commission: the Sales Growth Advisor is already compensated at FUNDING time
    // (Auto-Fund 15%/8%; Prepaid 10%). Classification keys on wallet value actually
    // applied to this booking, taken from the submitted wallet decision and stamped
    // immutably on the booking record.
    const walletInput = booking.wallet || {};
    const walletAppliedDollars = walletInput.use_wallet ? (parseFloat(walletInput.wallet_applied) || 0) : 0;
    const walletAppliedCents = Math.max(0, Math.round(walletAppliedDollars * 100));
    const isWalletFunded = walletAppliedCents > 0;
    const walletFundingSource = isWalletFunded
      ? await resolveWalletFundingSource(base44, walletInput.wallet_id)
      : 'none';

    // ── VIP promotional-credit enforcement (authoritative, server-side) ──────
    // A VIP member's PROMOTIONAL Booking Value may not pay for a standalone MLS
    // Walkthrough. Cash-funded Booking Value remains fully usable there, and
    // photography, video, premium packages and qualifying bundles keep full
    // promotional access. Enforced HERE, on the booking transaction itself, so it
    // cannot be bypassed by a direct API call, a booking edit, a payment shortfall,
    // or a UI change. No booking-count cap is applied.
    if (isWalletFunded) {
      const vipDecision = await assertVipWalletRedemption({
        base44: base44.asServiceRole,
        wallet_id: walletInput.wallet_id,
        applied_cents: walletAppliedCents,
        package_id: booking.package,
      });
      if (!vipDecision.allowed) {
        return Response.json({
          error: vipDecision.reason,
          error_code: vipDecision.code,
          promotional_remaining_cents: vipDecision.promotional_remaining_cents,
          cash_funded_usable_cents: vipDecision.cash_funded_usable_cents,
        }, { status: 409 });
      }
    }

    // Which pool actually funds a personal order. Company orders are stamped below
    // with the organization's own pool — the two are never mixed.
    const personalCreditSource = !isWalletFunded
      ? 'personal_cash'
      : walletFundingSource === 'auto_fund'
      ? 'personal_auto_fund'
      : 'personal_prepaid';

    // Create booking in database — auto-approve past shoots
    const { wallet: _walletInput, purchasing_context: _contextInput, ...bookingFields } = booking;
    const createdBooking = await base44.asServiceRole.entities.Booking.create({
      ...bookingFields,
      wallet_applied_cents: walletAppliedCents,
      wallet_id: isWalletFunded ? (walletInput.wallet_id || '') : '',
      wallet_funding_source: walletFundingSource,
      booking_funding_classification: isWalletFunded ? 'wallet_funded' : 'standard_marketplace',
      ordering_user_email: orderingEmail,
      purchasing_context: orderContext.type === 'organization' ? 'organization' : 'personal',
      purchasing_organization_id: orderContext.type === 'organization' ? orderContext.organization_id : '',
      purchasing_organization_name: orderContext.type === 'organization' ? orderContext.organization_name || '' : '',
      b2b_organization_member_id: orderContext.type === 'organization' ? orderContext.member_id || '' : '',
      b2b_contract_id: orderContext.type === 'organization' ? orderContext.contract_id || '' : '',
      credit_source: orderContext.type === 'organization'
        ? (orderContext.credit_source || 'b2b_contract')
        : personalCreditSource,
      b2b_credit_status: orderContext.type === 'organization' ? 'pending' : 'not_applicable',
      status: isPastShoot ? 'approved' : 'pending'
    });

    // PAYOUT_V2: Resolve sales rep with Brad fallback for marketplace gigs.
    // Every eligible marketplace job gets a 15% sales commission. If no other
    // sales rep is associated, Brad is the default rep.
    const resolvedRep = await resolveMarketplaceSalesRep(base44, {
      assignedSalesRepId: booking.sales_member_id || '',
      clientEmail: booking.client_email || '',
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
        sales_member_id: resolvedRep.sales_member_id,
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

    // ── Company credit application (organization orders only) ────────────────
    // Uses the EXISTING B2B credit engine, which reserves from the ORGANIZATION's
    // own period (AVAILABLE → RESERVED). Retail pricing, invoices, commissions and
    // the personal prepaid/Auto-Fund wallet are not touched by this step.
    if (orderContext.type === 'organization' && orderContext.contract_id) {
      try {
        if (!orderContext.period_id) {
          await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
            b2b_credit_status: 'needs_review',
            b2b_credit_note: 'The company has no active credit period yet.',
          });
        } else {
          const requirement = await resolveB2BBookingEntitlementRequirement(base44.asServiceRole, {
            organization_id: orderContext.organization_id,
            contract_id: orderContext.contract_id,
            package: booking.package,
            property_sqft: booking.property_sqft || 0,
            addon_ids: booking.add_ons || [],
            selected_add_ons: [],
          });

          if (!requirement?.success || requirement.requires_custom_quote) {
            await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
              b2b_credit_status: 'needs_review',
              b2b_credit_note: requirement?.requires_custom_quote
                ? 'Custom quote required for this property size under the company contract.'
                : requirement?.reason || 'Company contract pricing could not be resolved.',
            });
          } else if (requirement.funding_mode === 'media_credit') {
            const units = Number(requirement.total_credit_requirement || 0);
            const reservation = await reserveB2BMediaCredits(base44.asServiceRole, {
              period_id: orderContext.period_id,
              amount_units: units,
              idempotency_key: `booking_${createdBooking.id}_reserve`,
              reservation_id: `res_${createdBooking.id}`,
              booking_reference: createdBooking.id,
              actor: `customer:${orderContext.ordering_person_email}`,
              acting_user_id: membershipAccount?.id,
              organization_member_id: orderContext.member_id,
              contract_id: orderContext.contract_id,
              contract_version_id: orderContext.contract_version_id,
              allow_split_tender: true,
            });

            if (reservation?.success) {
              const shortfall = Number(reservation.credit_shortfall || 0);
              await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
                b2b_credit_status: 'reserved',
                b2b_credit_reservation_id: reservation.reservation_id || `res_${createdBooking.id}`,
                b2b_credit_units_reserved: Number(reservation.credit_applied || 0),
                b2b_credit_note:
                  shortfall > 0
                    ? `Company credits covered ${(Number(reservation.credit_applied || 0) / 100).toFixed(2)}; $${Number(
                        reservation.cash_remainder || 0
                      ).toFixed(2)} remains a cash obligation on the company contract.`
                    : '',
              });
            } else {
              await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
                b2b_credit_status: 'reservation_failed',
                b2b_credit_note: reservation?.reason || 'Company credits could not be reserved.',
              });
            }
          } else if (requirement.funding_mode === 'reserved_capacity') {
            const shoots = Number(requirement.reserved_shoot_requirement || 1);
            const reservation = await reserveB2BCapacity(base44.asServiceRole, {
              period_id: orderContext.period_id,
              shoots,
              idempotency_key: `booking_${createdBooking.id}_reserve`,
              reservation_id: `res_${createdBooking.id}`,
              booking_reference: createdBooking.id,
              actor: `customer:${orderContext.ordering_person_email}`,
              acting_user_id: membershipAccount?.id,
              organization_member_id: orderContext.member_id,
              contract_id: orderContext.contract_id,
              contract_version_id: orderContext.contract_version_id,
              allow_overage: true,
            });

            if (reservation?.success) {
              await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
                b2b_credit_status: 'reserved',
                b2b_credit_reservation_id: reservation.reservation_id || `res_${createdBooking.id}`,
                b2b_credit_units_reserved: Number(reservation.shoots_applied || 0),
                b2b_credit_note:
                  Number(reservation.shoots_shortfall || 0) > 0
                    ? `${reservation.shoots_shortfall} shoot(s) exceeded the contracted capacity and were recorded as company overage.`
                    : '',
              });
            } else {
              await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
                b2b_credit_status: 'reservation_failed',
                b2b_credit_note: reservation?.reason || 'Company capacity could not be reserved.',
              });
            }
          }
        }
      } catch (creditErr) {
        console.error('Company credit reservation error:', creditErr.message);
        await base44.asServiceRole.entities.Booking.update(createdBooking.id, {
          b2b_credit_status: 'reservation_failed',
          b2b_credit_note: creditErr.message,
        }).catch(() => {});
      }
    }

    // PAYOUT_V2: Always create a pending commission for marketplace gigs.
    // The sales rep is resolved with Brad fallback — every eligible job has a
    // 15% sales commission. Uses the canonical commissionable_service_value
    // from the pricing engine when available; falls back to total_price * 0.15.
    // Auto-Fund / wallet-funded bookings: ZERO booking-level sales commission —
    // the advisor was already compensated at funding time. Standard marketplace
    // bookings keep the existing 15% PAYOUT_V2 commission.
    if (!isWalletFunded) try {
      let repData = null;
      try {
        const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: resolvedRep.sales_member_id });
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
          employee_id: resolvedRep.sales_member_id,
          employee_email: repData?.email || resolvedRep.sales_member_email || '',
          employee_name: repData?.full_name || resolvedRep.sales_member_name || '',
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

    // For past shoots: create a Job assigned to admin (Bradley) and skip all client/admin notifications
    if (isPastShoot) {
      // PAYOUT_V2: Use canonical media partner payout from the compensation engine
      let payRate = 0;
      const compData = canonicalPricing?.compensation;
      if (compData?.media_partner_payout) {
        payRate = compData.media_partner_payout / 100;
      } else {
        // Fallback to legacy pricing if compensation engine failed
        const packagePrices = { mls_walkthrough: 100, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 };
        const addOnPrices = { drone: 125, '3d_tour': 125, twilight: 125, rush_delivery: 100, vertical_reel: 40, ai_staging: 125 };
        const addOnsTotal = (booking.add_ons || []).reduce((sum, id) => sum + (addOnPrices[id] || 0), 0);
        payRate = (packagePrices[booking.package] || 0) + addOnsTotal;
      }

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
          pricing_snapshot_id: canonicalPricing?.pricing_snapshot_id || '',
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

    // Send admin notification email via Brevo (skip for past shoots)
    if (!isPastShoot) try {
      
      const emailSubject = `New Booking Request - ${booking.client_name}`;
      const payAtClosingNote = booking.request_pay_at_closing ? '\n\n⚠️ CLIENT REQUESTED PAY-AT-CLOSING' : '';
      const emailBody = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone}\nProperty: ${propertyAddress}\nDate: ${booking.preferred_date}\nTime: ${booking.preferred_time}\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\nNotes: ${booking.notes || 'None'}${payAtClosingNote}\n\nView and manage this booking in your admin dashboard.`;

      const response = await sendBrevoEmail({
        to: adminEmail,
        subject: emailSubject,
        textContent: emailBody,
        senderEmail: BOOKINGS_SENDER_EMAIL,
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
      // Send booking confirmation email via Brevo (skip for past shoots)
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
        
        const emailSubject = 'Your Booking Request Confirmation';
        const emailReceipt = await sendBrevoEmail({
          to: booking.client_email,
          subject: emailSubject,
          htmlContent: confirmationHtmlBody,
          senderEmail: BOOKINGS_SENDER_EMAIL,
        });
        
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email', recipient_type: 'client', recipient_email: booking.client_email,
          message_content: 'Booking confirmation sent', subject: emailSubject,
          status: emailReceipt.ok ? 'success' : 'failed',
          error_message: null
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
      // Pay-at-closing: send simple confirmation via Brevo (skip for past shoots)
      try {
        const exactPrice = commissionableServiceValueCents > 0
          ? `$${(commissionableServiceValueCents / 100).toFixed(2)}`
          : `$${booking.total_price}`;
        
        const emailSubject = 'Your Booking Request Confirmation';
        const emailBody = `Thank you for your booking request!\n\nWe've received your request for:\n\nPackage: ${booking.package}\nProperty: ${propertyAddress}\nPreferred Date: ${booking.preferred_date}\nPreferred Time: ${booking.preferred_time}\nService Total: ${exactPrice}\n\nYour payment will be collected at closing. We'll be in touch to confirm the details.\n\nThank you!`;

        const response = await sendBrevoEmail({
          to: booking.client_email,
          subject: emailSubject,
          textContent: emailBody,
          senderEmail: BOOKINGS_SENDER_EMAIL,
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
}