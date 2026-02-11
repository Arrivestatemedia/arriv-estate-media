import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { user_type } = await req.json();

        if (!user_type || !['contractor', 'customer'].includes(user_type)) {
            return Response.json({ error: 'Invalid user_type' }, { status: 400 });
        }

        await base44.auth.updateMe({ user_type });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});