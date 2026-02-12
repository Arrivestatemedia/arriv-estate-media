import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user has pending signup data
        const fullUser = await base44.asServiceRole.entities.User.get(user.id);
        
        if (fullUser.pending_signup_data) {
            const { user_type, full_name, phone_number, user_role } = fullUser.pending_signup_data;
            
            // Apply the pending data
            await base44.asServiceRole.entities.User.update(user.id, {
                user_type,
                full_name,
                phone_number,
                role: user_role || 'user',
                pending_signup_data: null
            });

            return Response.json({ 
                success: true, 
                applied: true,
                user_type,
                role: user_role || 'user'
            });
        }

        return Response.json({ success: true, applied: false });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});