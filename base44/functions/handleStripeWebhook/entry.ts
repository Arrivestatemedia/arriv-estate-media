import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, updatePartnerRecord } from '../../shared/stripeConnect.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    
    // Verify webhook signature (you'll need to set STRIPE_WEBHOOK_SECRET)
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')
    );
    
    // Handle payment_intent.succeeded by looking up the checkout session
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      console.log('payment_intent.succeeded:', paymentIntent.id);

      // Find invoice by payment intent ID or customer email
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ payment_status: 'unpaid' });

      // Match by payment intent ID (if already stored) or customer email
      let invoice = invoices.find(inv => inv.stripe_payment_intent_id === paymentIntent.id);

      if (!invoice) {
        const customerEmail = paymentIntent.receipt_email || paymentIntent.customer_email;
        console.log('Trying email match:', customerEmail);
        if (customerEmail) {
          invoice = invoices.find(inv => inv.client_email?.toLowerCase() === customerEmail.toLowerCase());
        }
      }

      // Also try matching via the checkout session linked to this payment intent
      if (!invoice) {
        try {
          const sessions = await fetch(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${paymentIntent.id}&limit=1`, {
            headers: { 'Authorization': `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` }
          });
          const sessionData = await sessions.json();
          const session = sessionData.data?.[0];
          if (session) {
            console.log('Found checkout session:', session.id, 'payment_link:', session.payment_link);
            if (session.payment_link) {
              invoice = invoices.find(inv => inv.stripe_payment_link_id === session.payment_link);
            }
            if (!invoice) {
              const email = session.customer_details?.email;
              if (email) invoice = invoices.find(inv => inv.client_email?.toLowerCase() === email.toLowerCase());
            }
          }
        } catch (e) {
          console.warn('Could not look up checkout session:', e.message);
        }
      }

      console.log('Matched invoice:', invoice?.id || 'NO MATCH');

      if (invoice) {
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntent.id
        });
        await base44.asServiceRole.functions.invoke('processPaymentConfirmation', { invoiceId: invoice.id });
      } else {
        console.warn('No invoice matched for payment_intent:', paymentIntent.id);
      }
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('Checkout session completed:', {
          sessionId: session.id,
          paymentLink: session.payment_link,
          metadata: session.metadata,
          paymentIntent: session.payment_intent
        });

        // Check if this is a media partner onboarding payment
        if (session.metadata?.purpose === 'media_partner_onboarding_fee') {
          const userEmail = session.metadata.userEmail;
          const pendingSignupId = session.metadata.pendingSignupId;
          const userId = session.metadata.userId;

          const onboardingUpdate = {
            onboardingFeePaid: true,
            onboardingFeePaidAt: new Date().toISOString(),
            orientationCompleted: true,
            orientationCompletedAt: new Date().toISOString()
          };

          if (pendingSignupId) {
            await base44.asServiceRole.entities.PendingSignup.update(pendingSignupId, onboardingUpdate);
          }

          if (userId) {
            await base44.asServiceRole.entities.User.update(userId, onboardingUpdate);
          }

          if (!pendingSignupId && !userId && userEmail) {
            const emailRegex = { $regex: `^${userEmail}$`, $options: 'i' };
            const [signups, users] = await Promise.all([
              base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex }),
              base44.asServiceRole.entities.User.filter({ email: emailRegex })
            ]);
            if (signups[0]) await base44.asServiceRole.entities.PendingSignup.update(signups[0].id, onboardingUpdate);
            if (users[0]) await base44.asServiceRole.entities.User.update(users[0].id, onboardingUpdate);
          }

          // Generate receipt and send notifications
          try {
            // Resolve the userId if not already available
            let resolvedUserId = userId;
            if (!resolvedUserId && userEmail) {
              const matchedUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
              if (matchedUsers[0]) resolvedUserId = matchedUsers[0].id;
            }

            if (resolvedUserId) {
              const receiptResult = await base44.asServiceRole.functions.invoke('generateOnboardingReceipt', {
                userId: resolvedUserId,
                paymentIntentId: session.payment_intent,
                paidAt: new Date().toISOString()
              });

              const driveUrl = receiptResult?.data?.driveUrl;

              await base44.asServiceRole.functions.invoke('sendOnboardingReceiptNotifications', {
                userId: resolvedUserId,
                receiptUrl: driveUrl || ''
              });
            }
          } catch (receiptError) {
            console.error('Failed to generate/send onboarding receipt:', receiptError.message);
          }

          return Response.json({ received: true });
        }

        // Find invoice by stripe_checkout_session_id (most reliable)
        console.log('Searching for invoice with checkout session:', session.id, 'payment_link:', session.payment_link, 'customer_email:', session.customer_details?.email);
        const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
          payment_status: 'unpaid'
        });

        console.log('Found unpaid invoices:', invoices.length, invoices.map(i => ({ id: i.id, email: i.client_email, plinkId: i.stripe_payment_link_id })));

        // Match 1: by checkout session ID (most precise) — skip if stored value is actually a plink_ ID
        let invoice = invoices.find(inv =>
          inv.stripe_checkout_session_id &&
          !inv.stripe_checkout_session_id.startsWith('plink_') &&
          inv.stripe_checkout_session_id === session.id
        );

        // Match 2: by payment link ID
        if (!invoice && session.payment_link) {
          console.log('No match on session ID, trying payment link ID:', session.payment_link);
          invoice = invoices.find(inv => inv.stripe_payment_link_id === session.payment_link);
        }

        // Match 3: by customer email (fallback — works when payment_link is null)
        if (!invoice) {
          const customerEmail = session.customer_details?.email || session.customer_email;
          console.log('No match on payment link, trying customer email:', customerEmail);
          if (customerEmail) {
            invoice = invoices.find(inv => inv.client_email?.toLowerCase() === customerEmail.toLowerCase());
          }
        }

        console.log('Matched invoice:', invoice?.id || 'NO MATCH', invoice?.client_email);

        if (invoice) {
          console.log('Updating invoice:', invoice.id, 'to paid status');
          await base44.asServiceRole.entities.Invoice.update(invoice.id, {
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent
          });

          console.log('Processing payment confirmation for invoice:', invoice.id);
          await base44.asServiceRole.functions.invoke('processPaymentConfirmation', {
            invoiceId: invoice.id
          });
        } else {
          console.warn('No invoice matched for session:', session.id, 'Payment link:', session.payment_link);
        }
    }

    // Stripe Connect: keep each partner's payout/onboarding status in sync.
    if (event.type === 'account.updated') {
      const acct = event.data.object;
      const email = acct.email || acct.metadata?.base44_email;
      if (email) {
        try {
          const rec = await findPartnerRecord(base44, email);
          if (rec) {
            await updatePartnerRecord(base44, rec, {
              stripe_payouts_enabled: !!acct.payouts_enabled,
              stripe_details_submitted: !!acct.details_submitted
            });
          }
        } catch (e) {
          console.warn('account.updated: could not sync partner record:', e.message);
        }
      }
    }

    // Preferred membership: handle subscription lifecycle + $10 monthly residual
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const clientId = sub.metadata?.client_id;
      const clientEmail = sub.metadata?.client_email;
      const clientName = sub.metadata?.client_name || '';
      const salesOriginatorId = sub.metadata?.sales_originator_id || '';
      const salesOriginatorName = sub.metadata?.sales_originator_name || '';

      if (clientId || clientEmail) {
        try {
          const existing = await base44.asServiceRole.entities.PreferredMembership.filter({
            stripe_subscription_id: sub.id,
          });
          const statusMap: Record<string, string> = {
            active: 'active', past_due: 'past_due', canceled: 'canceled',
            incomplete: 'incomplete', trialing: 'trialing', paused: 'paused',
          };
          const membershipData = {
            client_id: clientId || '',
            client_email: clientEmail || '',
            client_name: clientName,
            plan: 'preferred_monthly',
            status: statusMap[sub.status] || sub.status,
            monthly_price: 29.99,
            sales_originator_id: salesOriginatorId,
            sales_originator_name: salesOriginatorName,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000).toISOString() : null,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end || false,
            started_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : null,
          };

          if (existing && existing[0]) {
            await base44.asServiceRole.entities.PreferredMembership.update(existing[0].id, membershipData);
          } else {
            await base44.asServiceRole.entities.PreferredMembership.create(membershipData);
          }
        } catch (e) {
          console.warn('subscription event: could not sync PreferredMembership:', e.message);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      try {
        const existing = await base44.asServiceRole.entities.PreferredMembership.filter({
          stripe_subscription_id: sub.id,
        });
        if (existing && existing[0]) {
          await base44.asServiceRole.entities.PreferredMembership.update(existing[0].id, {
            status: 'canceled',
            cancelled_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.warn('subscription.deleted: could not update PreferredMembership:', e.message);
      }
    }

    // Preferred membership: $10 monthly residual commission on invoice.paid
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        try {
          const memberships = await base44.asServiceRole.entities.PreferredMembership.filter({
            stripe_subscription_id: subscriptionId,
          });
          const membership = memberships?.[0];
          if (membership && membership.sales_originator_id && membership.status === 'active') {
            const periodEnd = invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString() : null;

            // Idempotency: skip if residual already paid for this period
            if (periodEnd && membership.last_residual_period_end === periodEnd) {
              console.log('Residual already paid for period:', periodEnd);
            } else {
              // Look up the sales rep for the commission
              const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({
                id: membership.sales_originator_id,
              });
              const rep = reps?.[0];

              const commission = await base44.asServiceRole.entities.Commission.create({
                employee_id: membership.sales_originator_id,
                employee_email: rep?.email || '',
                employee_name: rep?.full_name || membership.sales_originator_name || '',
                payroll_employee_id: rep?.payroll_employee_id || '',
                compensation_type: 'commission',
                commission_plan_id: 'preferred_residual',
                deal_id: membership.id,
                customer_name: membership.client_name || membership.client_email,
                description: `$10 monthly Preferred residual — ${membership.client_email}`,
                gross_amount: 10.00,
                earned_date: new Date().toISOString().slice(0, 10),
                intended_pay_period: new Date().toISOString().slice(0, 7),
                approval_status: 'approved',
                payroll_status: 'not_sent',
                compensation_version: 1,
              });

              await base44.asServiceRole.entities.PreferredMembership.update(membership.id, {
                last_residual_commission_id: commission.id,
                last_residual_period_end: periodEnd,
                last_successful_payment_at: new Date().toISOString(),
              });
              console.log('Created $10 residual commission for rep:', membership.sales_originator_id);
            }
          }
        } catch (e) {
          console.warn('invoice.paid: could not process Preferred residual:', e.message);
        }
      }
    }

    return Response.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});