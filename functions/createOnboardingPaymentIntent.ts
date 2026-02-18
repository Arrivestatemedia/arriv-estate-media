import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailRegex = { $regex: `^${email.trim()}$`, $options: 'i' };

        // Look up in PendingSignup first
        const signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex });
        const pendingUser = signups[0] || null;

        // Also check User entity
        const users = await base44.asServiceRole.entities.User.filter({ email: emailRegex });
        const appUser = users[0] || null;

        const targetUser = pendingUser || appUser;

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Already paid?
        if (targetUser.onboardingFeePaid) {
            return Response.json({ alreadyPaid: true });
        }

        // Calculate total
        let totalAmount = 5000; // $50 base
        if (targetUser.addGearBag) totalAmount += 5000;
        if (targetUser.addWaterBottle) totalAmount += 4000;

        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: totalAmount,
            currency: 'usd',
            metadata: {
                purpose: 'media_partner_onboarding_fee',
                userEmail: targetUser.email,
                pendingSignupId: pendingUser ? pendingUser.id : '',
                userId: appUser ? appUser.id : '',
                addGearBag: targetUser.addGearBag ? 'true' : 'false',
                addWaterBottle: targetUser.addWaterBottle ? 'true' : 'false',
            },
            automatic_payment_methods: { enabled: true },
        });

        return Response.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            totalAmount: totalAmount / 100,
            addGearBag: !!targetUser.addGearBag,
            addWaterBottle: !!targetUser.addWaterBottle
        });

    } catch (error) {
        console.error('createOnboardingPaymentIntent error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});