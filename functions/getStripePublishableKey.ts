import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const key = Deno.env.get('VITE_STRIPE_PUBLISHABLE_KEY');
        
        if (!key) {
            return Response.json({ error: 'Stripe key not configured' }, { status: 500 });
        }

        return Response.json({ publishableKey: key });
    } catch (error) {
        console.error('getStripePublishableKey error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});