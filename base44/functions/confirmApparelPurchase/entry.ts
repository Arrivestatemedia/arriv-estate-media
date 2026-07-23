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
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      return Response.json({ success: false, message: 'Payment not confirmed' }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    let users = await base44.asServiceRole.entities.User.filter({ email });
    if (!users.length && email !== emailLower) {
      users = await base44.asServiceRole.entities.User.filter({ email: emailLower });
    }
    let record = users[0] || null;
    let entity = 'User';

    if (!record) {
      let signups = await base44.asServiceRole.entities.PendingSignup.filter({ email });
      if (!signups.length && email !== emailLower) {
        signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailLower });
      }
      record = signups[0] || null;
      entity = 'PendingSignup';
    }

    if (!record) {
      return Response.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    if (record.apparelPurchased) {
      return Response.json({ success: true, alreadyHandled: true });
    }

    await base44.asServiceRole.entities[entity].update(record.id, { apparelPurchased: true });

    try {
      const receiptResult = await base44.asServiceRole.functions.invoke('generateOnboardingReceipt', {
        userId: entity === 'User' ? record.id : null,
        pendingSignupId: entity === 'PendingSignup' ? record.id : null,
        userEmail: record.email,
        paymentIntentId,
        paidAt: new Date().toISOString(),
        onlyApparel: true
      });
      const driveUrl = receiptResult?.data?.driveUrl;
      await base44.asServiceRole.functions.invoke('sendOnboardingReceiptNotifications', {
        userId: entity === 'User' ? record.id : null,
        pendingSignupId: entity === 'PendingSignup' ? record.id : null,
        userEmail: record.email,
        receiptUrl: driveUrl || '',
        onlyApparel: true
      });
    } catch (e) {
      console.error('Apparel receipt error:', e.message);
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('confirmApparelPurchase error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});