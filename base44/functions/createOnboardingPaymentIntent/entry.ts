import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

// Real prices (in cents)
const APPAREL_PRICE = 5000;       // $50.00 — shirt + jacket
const GEAR_BAG_PRICE = 5000;      // $50.00
const WATER_BOTTLE_PRICE = 4000;  // $40.00

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const email = (body.email || '').trim();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailLower = email.toLowerCase();

        // Try exact then lowercase for PendingSignup
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email });
        if (!signups.length && email !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }
        const pendingUser = signups[0] || null;

        // Try exact then lowercase for User
        let users = [];
        if (!pendingUser) {
            users = await base44.asServiceRole.entities.User.filter({ email });
            if (!users.length && email !== emailLower) {
                users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
            }
        }
        const appUser = users[0] || null;
        const targetUser = pendingUser || appUser;

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Apparel is only charged when the partner selected all three sizes
        const apparelSelected = !!(targetUser.shirtFit && targetUser.shirtSize && targetUser.jacketSize);
        const addGearBag = !!targetUser.addGearBag;
        const addWaterBottle = !!targetUser.addWaterBottle;

        const apparelAmount = apparelSelected ? APPAREL_PRICE : 0;
        const gearBagAmount = addGearBag ? GEAR_BAG_PRICE : 0;
        const waterBottleAmount = addWaterBottle ? WATER_BOTTLE_PRICE : 0;
        const total = apparelAmount + gearBagAmount + waterBottleAmount;

        // Nothing selected – nothing to charge
        if (total === 0) {
            return Response.json({ nothingToPay: true });
        }

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const pi = await stripe.paymentIntents.create({
            amount: total,
            currency: 'usd',
            metadata: {
                purpose: 'media_partner_gear_purchase',
                userEmail: targetUser.email,
                pendingSignupId: pendingUser ? pendingUser.id : '',
                userId: appUser ? appUser.id : '',
                apparel: apparelSelected ? 'true' : 'false',
                addGearBag: addGearBag ? 'true' : 'false',
                addWaterBottle: addWaterBottle ? 'true' : 'false',
            },
            automatic_payment_methods: { enabled: true },
        });

        return Response.json({
            success: true,
            clientSecret: pi.client_secret,
            totalAmount: total / 100,
            apparelSelected,
            addGearBag,
            addWaterBottle,
        });

    } catch (error) {
        console.error('createOnboardingPaymentIntent error:', error);
        return Response.json({ error: `Error: ${error.message || 'Unknown error occurred'}` }, { status: 500 });
    }
});