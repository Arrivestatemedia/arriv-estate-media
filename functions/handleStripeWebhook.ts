import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

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
    
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('Checkout session completed:', {
          sessionId: session.id,
          paymentLink: session.payment_link,
          metadata: session.metadata
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

        // Update PendingSignup if we have the ID
        if (pendingSignupId) {
          await base44.asServiceRole.entities.PendingSignup.update(pendingSignupId, onboardingUpdate);
        }
        
        // Update User entity if we have the ID
        if (userId) {
          await base44.asServiceRole.entities.User.update(userId, onboardingUpdate);
        }

        // If only email, find and update both
        if (!pendingSignupId && !userId && userEmail) {
          const emailRegex = { $regex: `^${userEmail}$`, $options: 'i' };
          const [signups, users] = await Promise.all([
            base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex }),
            base44.asServiceRole.entities.User.filter({ email: emailRegex })
          ]);
          if (signups[0]) await base44.asServiceRole.entities.PendingSignup.update(signups[0].id, onboardingUpdate);
          if (users[0]) await base44.asServiceRole.entities.User.update(users[0].id, onboardingUpdate);
        }
        
        return Response.json({ received: true });
      }
      
      // Find invoice by payment link (for Stripe Payment Links)
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
        payment_status: 'unpaid'
      });
      
      const invoice = invoices.find(inv => 
        inv.stripe_payment_link_id && 
        session.payment_link === inv.stripe_payment_link_id
      );
      
      if (invoice) {
        // Update invoice to paid
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: session.payment_intent
        });
        
        // Process payment confirmation
        await base44.asServiceRole.functions.invoke('processPaymentConfirmation', {
          invoiceId: invoice.id
        });
      }
    }
    
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      // Find invoice by payment intent ID (fallback for direct PI payments)
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
        payment_status: 'unpaid'
      });
      
      const invoice = invoices.find(inv => 
        inv.stripe_payment_link_id && 
        paymentIntent.charges?.data?.[0]?.payment_method_details?.card && 
        inv.amount === (paymentIntent.amount / 100)
      );
      
      if (invoice) {
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntent.id
        });
        
        await base44.asServiceRole.functions.invoke('processPaymentConfirmation', {
          invoiceId: invoice.id
        });
      }
    }
    
    return Response.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});