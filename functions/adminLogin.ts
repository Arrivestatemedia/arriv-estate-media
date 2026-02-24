import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'crypto';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Look up admin in SalesTeamMember database using service role (no auth required)
    const admins = await base44.asServiceRole.entities.SalesTeamMember.filter({
      email: email,
      role: 'admin'
    });

    if (!admins || admins.length === 0) {
      return Response.json({ error: 'Admin not found' }, { status: 401 });
    }

    const admin = admins[0];

    if (!admin.is_active) {
      return Response.json({ error: 'Account is inactive' }, { status: 401 });
    }

    // Verify password
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    if (passwordHash !== admin.password_hash) {
      return Response.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Return admin info
    return Response.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: 'admin'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});