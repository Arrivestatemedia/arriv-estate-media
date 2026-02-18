import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('Starting filter...');
        const result = await base44.asServiceRole.entities.PendingSignup.filter({ email: "BradCBurke91@gmail.com" });
        console.log('Filter complete:', result.length);
        
        return Response.json({ success: true, count: result.length });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});