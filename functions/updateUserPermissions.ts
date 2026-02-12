import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { pendingSignupId, email, userType, userRole } = await req.json();

    // Update PendingSignup
    await base44.entities.PendingSignup.update(pendingSignupId, { 
      user_type: userType, 
      user_role: userRole 
    });

    // Find and update the corresponding User record using service role
    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (users.length > 0) {
      await base44.asServiceRole.entities.User.update(users[0].id, { role: userRole });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});