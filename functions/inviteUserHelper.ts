import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email, role } = await req.json();

        if (!email || !role) {
            return Response.json({ error: 'Email and role are required' }, { status: 400 });
        }

        // Use service role to invite the user
        await base44.asServiceRole.auth.inviteUser(email, role);

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});