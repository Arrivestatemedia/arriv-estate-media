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

    return Response.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});