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

        // Try both original case and lowercase versions
        const emailVariants = [...new Set([email, email.toLowerCase(), email.toUpperCase()])];

        let pendingUser = null;
        for (const variant of emailVariants) {
            const results = await base44.asServiceRole.entities.PendingSignup.filter({ email: variant });
            if (results.length) { pendingUser = results[0]; break; }
        }

        let appUser = null;
        if (!pendingUser) {
            for (const variant of emailVariants) {
                const results = await base44.asServiceRole.entities.User.filter({ email: variant });
                if (results.length) { appUser = results[0]; break; }
            }
        }

        const targetUser = pendingUser || appUser;

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        if (targetUser.onboardingFeePaid) {
            return Response.json({ alreadyPaid: true });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const isTestUser = targetUser.user_role === 'test_user';
        let total = isTestUser ? 100 : 5000;
        if (targetUser.addGearBag) total += isTestUser ? 100 : 5000;
        if (targetUser.addWaterBottle) total += isTestUser ? 100 : 4000;

        const pi = await stripe.paymentIntents.create({
            amount: total,
            currency: 'usd',
            metadata: {
                purpose: 'media_partner_onboarding_fee',
                userEmail: targetUser.email,
                pendingSignupId: pendingUser ? pendingUser.id : '',
                userId: appUser ? appUser.id : '',
            },
            automatic_payment_methods: { enabled: true },
        });

        return Response.json({
            success: true,
            clientSecret: pi.client_secret,
            totalAmount: total / 100,
            addGearBag: !!targetUser.addGearBag,
            addWaterBottle: !!targetUser.addWaterBottle,
            isTestUser
        });

    } catch (error) {
        console.error('createOnboardingPaymentIntent error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});