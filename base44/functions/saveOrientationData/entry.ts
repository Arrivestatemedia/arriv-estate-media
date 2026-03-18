import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { email, shirtFit, shirtSize, jacketSize, addGearBag, addWaterBottle } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const emailRegex = { $regex: `^${email.trim()}$`, $options: 'i' };

        // Try PendingSignup first
        const signups = await base44.asServiceRole.entities.PendingSignup.filter({ email: emailRegex });
        if (signups.length > 0) {
            await base44.asServiceRole.entities.PendingSignup.update(signups[0].id, {
                shirtFit, shirtSize, jacketSize, addGearBag, addWaterBottle,
                apparelSizesConfirmedAt: new Date().toISOString()
            });
            return Response.json({ success: true });
        }

        // Fallback to User entity
        const users = await base44.asServiceRole.entities.User.filter({ email: emailRegex });
        if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
                shirtFit, shirtSize, jacketSize, addGearBag, addWaterBottle,
                apparelSizesConfirmedAt: new Date().toISOString()
            });
            return Response.json({ success: true });
        }

        return Response.json({ error: 'User not found' }, { status: 404 });

    } catch (error) {
        console.error('saveOrientationData error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});