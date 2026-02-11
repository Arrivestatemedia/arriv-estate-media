import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const [verifiedUsers, pendingSignups] = await Promise.all([
            base44.asServiceRole.entities.User.list('-created_date', 1000),
            base44.asServiceRole.entities.PendingSignup.list('-created_date', 1000)
        ]);

        const formattedUsers = verifiedUsers.map(u => ({
            id: u.id,
            email: u.email,
            full_name: u.full_name,
            user_type: u.user_type,
            phone_number: u.phone_number,
            role: u.role,
            created_date: u.created_date,
            updated_date: u.updated_date,
            status: 'verified'
        }));

        const formattedPending = pendingSignups.map(p => ({
            id: p.id,
            email: p.email,
            full_name: p.full_name,
            user_type: p.user_type,
            phone_number: p.phone_number,
            role: 'user',
            created_date: p.created_date,
            updated_date: p.updated_date,
            status: 'pending'
        }));

        const allUsers = [...formattedUsers, ...formattedPending].sort((a, b) => 
            new Date(b.created_date) - new Date(a.created_date)
        );

        return Response.json({
            success: true,
            users: allUsers
        });
    } catch (error) {
        console.error('List users error:', error);
        return Response.json({ error: error.message || 'Failed to list users' }, { status: 500 });
    }
});