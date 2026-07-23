import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const APPAREL_PRICE = 5000; // $50.00 (shirt & jacket)

// Same pay-period definition as the media partner dashboard
const getPayPeriodStart = () => {
  const d = new Date();
  const currentDay = d.getDay(); // 0 = Sunday, 5 = Friday
  const lastFridayDate = d.getDate() - ((currentDay + 2) % 7);
  const lastFriday = new Date(d.getFullYear(), d.getMonth(), lastFridayDate);
  lastFriday.setHours(4, 0, 0, 0);
  return lastFriday;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const email = (body.email || '').trim();
    const method = body.method; // 'stripe' | 'balance'

    if (!email || !method) {
      return Response.json({ error: 'Email and method required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    // Look up partner (User first, fallback PendingSignup)
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
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    if (record.apparelPurchased) {
      return Response.json({ alreadyPurchased: true });
    }

    const apparelSelected = !!(record.shirtFit && record.shirtSize && record.jacketSize);

    if (method === 'balance') {
      if (!apparelSelected) {
        return Response.json({ error: 'Please select your shirt fit, size, and jacket size first.', code: 'SIZES_REQUIRED' }, { status: 400 });
      }

      // Compute available balance this pay period
      const periodStart = getPayPeriodStart();
      const jobs = await base44.asServiceRole.entities.Job.filter({ booked_by: email });
      const jobBalance = jobs
        .filter(j => j.status === 'completed' && j.completed_at && new Date(j.completed_at) >= periodStart)
        .reduce((s, j) => s + (j.pay_rate || 0), 0);

      const payouts = await base44.asServiceRole.entities.PayoutHistory.filter({ media_partner_email: email });
      const deductionsThisPeriod = payouts
        .filter(p => p.payout_type === 'apparel_deduction' && new Date(p.payout_date) >= periodStart)
        .reduce((s, p) => s + (p.amount || 0), 0);

      const availableBalance = jobBalance - deductionsThisPeriod;

      if (availableBalance < 50) {
        return Response.json({
          error: 'Your current balance is not enough to purchase the apparel.',
          code: 'INSUFFICIENT_BALANCE',
          balance: availableBalance
        }, { status: 400 });
      }

      // Record the deduction as a completed payout entry
      await base44.asServiceRole.entities.PayoutHistory.create({
        media_partner_email: record.email,
        media_partner_name: record.full_name,
        amount: 50,
        payout_method: record.payout_method || 'zelle',
        payout_destination: 'Apparel - Shirt & Jacket',
        payout_date: new Date().toISOString().split('T')[0],
        status: 'completed',
        payout_type: 'apparel_deduction'
      });

      await base44.asServiceRole.entities[entity].update(record.id, { apparelPurchased: true });

      // Generate receipt + email/SMS the partner
      try {
        const receiptResult = await base44.asServiceRole.functions.invoke('generateOnboardingReceipt', {
          userId: entity === 'User' ? record.id : null,
          pendingSignupId: entity === 'PendingSignup' ? record.id : null,
          userEmail: record.email,
          paymentIntentId: `BALANCE-${Date.now()}`,
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

      return Response.json({ success: true, method: 'balance' });
    }

    if (method === 'stripe') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const pi = await stripe.paymentIntents.create({
        amount: APPAREL_PRICE,
        currency: 'usd',
        metadata: {
          purpose: 'media_partner_apparel_purchase',
          userEmail: record.email,
          userId: entity === 'User' ? record.id : '',
          pendingSignupId: entity === 'PendingSignup' ? record.id : '',
        },
        automatic_payment_methods: { enabled: true },
      });
      return Response.json({
        success: true,
        method: 'stripe',
        clientSecret: pi.client_secret,
        totalAmount: APPAREL_PRICE / 100
      });
    }

    return Response.json({ error: 'Invalid method' }, { status: 400 });

  } catch (error) {
    console.error('purchaseApparel error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});