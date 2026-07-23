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

        // Look up the partner in PendingSignup first, then User
        let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email });
        if (!signups.length && email !== emailLower) {
            signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
        }

        let record = signups[0] || null;
        let entity = 'PendingSignup';

        if (!record) {
            let users = await base44.asServiceRole.entities.User.filter({ email });
            if (!users.length && email !== emailLower) {
                users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
            }
            record = users[0] || null;
            entity = 'User';
        }

        if (!record) {
            return Response.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        // Already handled (e.g. webhook marked it earlier) – skip to avoid duplicate receipts
        if (record.onboardingFeePaid) {
            return Response.json({ success: true, alreadyHandled: true });
        }

        const paidAt = new Date().toISOString();
        const apparelSelected = !!(record.shirtFit && record.shirtSize && record.jacketSize);
        await base44.asServiceRole.entities[entity].update(record.id, {
            onboardingFeePaid: true,
            apparelPurchased: apparelSelected
        });

        // Generate a PDF receipt and email/SMS it to the partner
        try {
            const receiptResult = await base44.asServiceRole.functions.invoke('generateOnboardingReceipt', {
                userId: entity === 'User' ? record.id : null,
                pendingSignupId: entity === 'PendingSignup' ? record.id : null,
                userEmail: record.email,
                paymentIntentId,
                paidAt
            });
            const driveUrl = receiptResult?.data?.driveUrl;
            await base44.asServiceRole.functions.invoke('sendOnboardingReceiptNotifications', {
                userId: entity === 'User' ? record.id : null,
                pendingSignupId: entity === 'PendingSignup' ? record.id : null,
                userEmail: record.email,
                receiptUrl: driveUrl || ''
            });
        } catch (err) {
            console.error('Receipt generation error:', err.message);
        }

        return Response.json({ success: true, marked: entity });

    } catch (error) {
        console.error('confirmPaymentAndMarkComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});