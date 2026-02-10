import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email, full_name, phone_number } = await req.json();

        if (!email || !full_name) {
            return Response.json({ error: 'Email and full name are required' }, { status: 400 });
        }

        // Invite the user as a regular user
        await base44.users.inviteUser(email, "user");

        // Update their user_type to customer
        const users = await base44.asServiceRole.entities.User.filter({ email });
        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                user_type: "customer",
                full_name,
                phone_number
            });
        }

        return Response.json({ 
            success: true, 
            message: 'Customer invitation sent successfully' 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});