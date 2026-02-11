import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { user_id } = await req.json();

        if (!user_id) {
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Prevent deleting yourself
        if (user.id === user_id) {
            return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }

        await base44.asServiceRole.entities.User.delete(user_id);

        return Response.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        return Response.json({ error: error.message || 'Failed to delete user' }, { status: 500 });
    }
});