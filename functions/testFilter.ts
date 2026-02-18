import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('Starting list...');
        const result = await base44.asServiceRole.entities.PendingSignup.list();
        console.log('List complete:', result.length);
        
        const filtered = result.filter(r => r.email?.toLowerCase() === 'bradcburke91@gmail.com');
        console.log('Found:', filtered.length);
        
        return Response.json({ success: true, count: filtered.length });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});