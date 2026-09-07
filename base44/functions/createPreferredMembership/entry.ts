import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import Stripe from "npm:stripe@17.5.0";

// Create a Preferred membership subscription via Stripe Checkout.
// $29.99/month, tracks the sales originator for the $10 monthly residual.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { client_id, client_email, client_name, sales_originator_id, sales_originator_name } = body;

    if (!client_email || !client_id) {
      return Response.json({ error: "client_id and client_email are required" }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "https://arrivestatemedia.base44.app";

    // Create or retrieve Stripe customer
    let stripeCustomerId = "";
    try {
      const existingCustomers = await stripe.customers.list({ email: client_email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email: client_email,
          name: client_name || client_email,
          metadata: { client_id, app: "estate_media" },
        });
        stripeCustomerId = newCustomer.id;
      }
    } catch (e) {
      console.error("Stripe customer creation error:", e.message);
      return Response.json({ error: "Failed to create Stripe customer" }, { status: 500 });
    }

    // Create Checkout session for $29.99/mo subscription
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            product_data: {
              name: "Arriv Preferred Membership",
              description: "Monthly membership: 10% off all media services, $5 off MLS walkthroughs, enhanced referral rewards",
            },
            unit_amount: 2999,
          },
          quantity: 1,
        },
      ],
      metadata: {
        client_id,
        client_email,
        client_name: client_name || "",
        sales_originator_id: sales_originator_id || "",
        sales_originator_name: sales_originator_name || "",
        purpose: "preferred_membership",
      },
      success_url: `${appDomain}/BookingPage?preferred=success`,
      cancel_url: `${appDomain}/BookingPage?preferred=cancelled`,
    });

    return Response.json({ success: true, checkout_url: session.url, session_id: session.id });
  } catch (error) {
    console.error("createPreferredMembership error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}