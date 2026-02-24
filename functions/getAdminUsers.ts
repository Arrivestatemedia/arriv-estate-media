import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service role to fetch all admin users (ignores entity permissions)
    const admins = await base44.asServiceRole.entities.User.filter({
      role: 'admin'
    });

    return Response.json({ admins: admins || [] });
  } catch (error) {
    console.error('Error fetching admins:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});