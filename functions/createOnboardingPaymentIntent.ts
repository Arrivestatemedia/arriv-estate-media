import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const email = (body.email || '').trim();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailLower = email.toLowerCase();

        // Fetch all pending media partner signups and find by email
        const allSignups = await base44.asServiceRole.entities.PendingSignup.list();
        const pendingUser = allSignups.find(s => s.email && s.email.toLowerCase() === emailLower) || null;

        if (!pendingUser) {
            // Try User entity
            const allUsers = await base44.asServiceRole.entities.User.list();
            const appUser = allUsers.find(u => u.email && u.email.toLowerCase() === emailLower) || null;

            if (!appUser) {
                return Response.json({ error: 'User not found' }, { status: 404 });
            }

            if (appUser.onboardingFeePaid) {
                return Response.json({ alreadyPaid: true });
            }

            const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
            const isTestUser = appUser.user_role === 'test_user';
            let total = isTestUser ? 100 : 5000;
            if (appUser.addGearBag) total += isTestUser ? 100 : 5000;
            if (appUser.addWaterBottle) total += isTestUser ? 100 : 4000;

            const pi = await stripe.paymentIntents.create({
                amount: total,
                currency: 'usd',
                metadata: { purpose: 'media_partner_onboarding_fee', userEmail: appUser.email },
                automatic_payment_methods: { enabled: true },
            });

            return Response.json({
                success: true,
                clientSecret: pi.client_secret,
                totalAmount: total / 100,
                addGearBag: !!appUser.addGearBag,
                addWaterBottle: !!appUser.addWaterBottle,
                isTestUser
            });
        }

        if (pendingUser.onboardingFeePaid) {
            return Response.json({ alreadyPaid: true });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const isTestUser = pendingUser.user_role === 'test_user';
        let total = isTestUser ? 100 : 5000;
        if (pendingUser.addGearBag) total += isTestUser ? 100 : 5000;
        if (pendingUser.addWaterBottle) total += isTestUser ? 100 : 4000;

        const pi = await stripe.paymentIntents.create({
            amount: total,
            currency: 'usd',
            metadata: {
                purpose: 'media_partner_onboarding_fee',
                userEmail: pendingUser.email,
                pendingSignupId: pendingUser.id,
            },
            automatic_payment_methods: { enabled: true },
        });

        return Response.json({
            success: true,
            clientSecret: pi.client_secret,
            totalAmount: total / 100,
            addGearBag: !!pendingUser.addGearBag,
            addWaterBottle: !!pendingUser.addWaterBottle,
            isTestUser
        });

    } catch (error) {
        console.error('createOnboardingPaymentIntent error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});