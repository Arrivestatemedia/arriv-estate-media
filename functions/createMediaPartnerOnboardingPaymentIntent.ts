import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.user_type !== 'media_partner') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await req.json();

    // Get user data
    const users = await base44.asServiceRole.entities.User.filter({ id: userId });
    const targetUser = users[0];

    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate total amount
    const baseAmount = 5000; // $50 in cents
    const gearBagAmount = targetUser.addGearBag ? 5000 : 0;
    const waterBottleAmount = targetUser.addWaterBottle ? 4000 : 0;
    const totalAmount = baseAmount + gearBagAmount + waterBottleAmount;

    // Create or retrieve Stripe customer
    let customerId = targetUser.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: targetUser.email,
        name: targetUser.full_name,
        metadata: {
          userId: targetUser.id,
          userType: 'media_partner'
        }
      });
      customerId = customer.id;

      // Update user with Stripe customer ID
      await base44.asServiceRole.entities.User.update(targetUser.id, {
        stripeCustomerId: customerId
      });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId: targetUser.id,
        purpose: 'media_partner_onboarding_fee',
        shirtFit: targetUser.shirtFit || '',
        shirtSize: targetUser.shirtSize || '',
        jacketSize: targetUser.jacketSize || '',
        addGearBag: targetUser.addGearBag ? 'true' : 'false',
        addWaterBottle: targetUser.addWaterBottle ? 'true' : 'false',
        totalOnboardingCharge: (totalAmount / 100).toString()
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Store PaymentIntent ID
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      stripeOnboardingPaymentIntentId: paymentIntent.id
    });

    return Response.json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});