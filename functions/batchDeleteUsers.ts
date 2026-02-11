import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Check admin privileges
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { user_ids } = await req.json();

        if (!Array.isArray(user_ids) || user_ids.length === 0) {
            return Response.json({ error: 'Invalid user IDs' }, { status: 400 });
        }

        // Prevent self-deletion
        const filteredIds = user_ids.filter(id => id !== user.id);

        if (filteredIds.length === 0) {
            return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        // Get all users to determine which entity each belongs to
        const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 10000);
        const allPending = await base44.asServiceRole.entities.PendingSignup.list('-created_date', 10000);
        
        const userMap = new Map();
        allUsers.forEach(u => userMap.set(u.id, { type: 'User', id: u.id }));
        allPending.forEach(p => userMap.set(p.id, { type: 'PendingSignup', id: p.id }));

        // Delete users from appropriate entities in parallel
        await Promise.all(
            filteredIds.map(userId => {
                const userInfo = userMap.get(userId);
                if (!userInfo) return Promise.resolve();
                
                if (userInfo.type === 'User') {
                    return base44.asServiceRole.entities.User.delete(userId);
                } else {
                    return base44.asServiceRole.entities.PendingSignup.delete(userId);
                }
            })
        );

        return Response.json({
            success: true,
            deleted_count: filteredIds.length,
            message: `Successfully deleted ${filteredIds.length} user${filteredIds.length !== 1 ? 's' : ''}`
        });
    } catch (error) {
        return Response.json({ error: error.message || 'Batch delete failed' }, { status: 500 });
    }
});