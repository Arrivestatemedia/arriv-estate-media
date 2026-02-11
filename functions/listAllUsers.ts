import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const users = await base44.asServiceRole.entities.User.list('-created_date', 1000);

        return Response.json({
            success: true,
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                full_name: u.full_name,
                user_type: u.user_type,
                phone_number: u.phone_number,
                role: u.role,
                created_date: u.created_date,
                updated_date: u.updated_date
            }))
        });
    } catch (error) {
        console.error('List users error:', error);
        return Response.json({ error: error.message || 'Failed to list users' }, { status: 500 });
    }
});