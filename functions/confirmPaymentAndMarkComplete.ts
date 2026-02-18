import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const email = (body.email || '').trim();
        const paymentIntentId = body.paymentIntentId || '';

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

        // Get payment intent to verify it succeeded
        let paymentIntent = null;
        if (paymentIntentId) {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (!paymentIntent || paymentIntent.status !== 'succeeded') {
                return Response.json({ success: false, message: 'Payment not confirmed' });
            }
        }

        const emailLower = email.toLowerCase();

        // Try to find and update PendingSignup first
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: email });
        if (!signups.length && email !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        if (signups.length > 0) {
            const signup = signups[0];
            await base44.asServiceRole.entities.PendingSignup.update(signup.id, {
                onboardingFeePaid: true
            });
            return Response.json({ success: true, marked: 'PendingSignup' });
        }

        // If not in PendingSignup, the user must already be fully signed up
        // In that case, they should have been in PendingSignup and completed signup
        // So this shouldn't happen, but we'll return success anyway
        return Response.json({ success: true, message: 'User already completed onboarding' });

    } catch (error) {
        console.error('confirmPaymentAndMarkComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});