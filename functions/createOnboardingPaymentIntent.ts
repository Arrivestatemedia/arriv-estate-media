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

        const emailTrimmed = email.trim();
        const emailLower = emailTrimmed.toLowerCase();

        // Try both original and lowercase
        const [signupsExact, signupsLower, usersExact, usersLower] = await Promise.all([
            base44.asServiceRole.entities.PendingSignup.filter({ email: emailTrimmed }),
            base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower }),
            base44.asServiceRole.entities.User.filter({ email: emailTrimmed }),
            base44.asServiceRole.entities.User.filter({ email: emailLower }),
        ]);

        const pendingUser = (signupsExact[0] || signupsLower[0]) || null;
        const appUser = (usersExact[0] || usersLower[0]) || null;

        const targetUser = pendingUser || appUser;

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Already paid?
        if (targetUser.onboardingFeePaid) {
            return Response.json({ alreadyPaid: true });
        }

        const isTestUser = targetUser.user_role === 'test_user';

        // Calculate total — $1 for test users, real prices for everyone else
        let baseAmount = isTestUser ? 100 : 5000; // $1 or $50
        let gearBagAmount = isTestUser ? 100 : 5000; // $1 or $50
        let waterBottleAmount = isTestUser ? 100 : 4000; // $1 or $40

        let totalAmount = baseAmount;
        if (targetUser.addGearBag) totalAmount += gearBagAmount;
        if (targetUser.addWaterBottle) totalAmount += waterBottleAmount;

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
            addWaterBottle: !!targetUser.addWaterBottle,
            isTestUser
        });

    } catch (error) {
        console.error('createOnboardingPaymentIntent error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});