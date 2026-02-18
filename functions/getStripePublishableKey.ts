Deno.serve(async (req) => {
    try {
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