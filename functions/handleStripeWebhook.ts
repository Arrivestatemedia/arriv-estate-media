import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    
    // Verify webhook signature (you'll need to set STRIPE_WEBHOOK_SECRET)
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')
    );
    
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      // Find invoice by payment link
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ 
        payment_status: 'unpaid'
      });
      
      const invoice = invoices.find(inv => 
        inv.stripe_payment_link_id && 
        paymentIntent.payment_link === inv.stripe_payment_link_id
      );
      
      if (invoice) {
        // Update invoice to paid
        await base44.asServiceRole.entities.Invoice.update(invoice.id, {
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntent.id
        });
        
        // Process payment confirmation
        await base44.asServiceRole.functions.invoke('processPaymentConfirmation', {
          invoiceId: invoice.id
        });
      }
    }
    
    return Response.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 400 });
  }
});