import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { user_id, full_name, phone_number, user_type, role } = await req.json();

        if (!user_id) {
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }

        const updateData = {};
        if (full_name) updateData.full_name = full_name;
        if (phone_number) updateData.phone_number = phone_number;
        if (user_type) updateData.user_type = user_type;
        if (role) updateData.role = role;

        const updatedUser = await base44.asServiceRole.entities.User.update(user_id, updateData);

        return Response.json({
            success: true,
            message: 'User updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update user error:', error);
        return Response.json({ error: error.message || 'Failed to update user' }, { status: 500 });
    }
});