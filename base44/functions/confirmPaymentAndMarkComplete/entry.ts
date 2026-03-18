import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const email = (body.email || '').trim();
        const paymentIntentId = (body.paymentIntentId || '').trim();

        if (!email || !paymentIntentId) {
            return Response.json({ error: 'Email and payment intent ID required' }, { status: 400 });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

        // Verify payment succeeded with Stripe directly
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
            return Response.json({ success: false, message: 'Payment not confirmed' }, { status: 400 });
        }

        const emailLower = email.toLowerCase();

        // Update PendingSignup
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: email });
        if (!signups.length && email !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        if (signups.length > 0) {
            await base44.asServiceRole.entities.PendingSignup.update(signups[0].id, {
                onboardingFeePaid: true
            });
            return Response.json({ success: true, marked: 'PendingSignup' });
        }

        // Update User
        let users = await base44.asServiceRole.entities.User.filter({ email: email });
        if (!users.length && email !== emailLower) {
            users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
        }

        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                onboardingFeePaid: true
            });
            return Response.json({ success: true, marked: 'User' });
        }

        return Response.json({ success: false, message: 'User not found' }, { status: 404 });

    } catch (error) {
        console.error('confirmPaymentAndMarkComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});