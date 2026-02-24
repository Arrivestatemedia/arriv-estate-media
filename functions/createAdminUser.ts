import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { email, full_name, password } = await req.json();

    if (!email || !full_name || !password) {
      return Response.json({ error: 'Email, name, and password required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    // Only allow existing admins to create new admins
    if (!currentUser || currentUser.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if user already exists
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email });
    if (existingUsers && existingUsers.length > 0) {
      return Response.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    // Create admin user in Base44 database
    const newAdmin = await base44.asServiceRole.entities.User.create({
      email,
      full_name,
      role: 'admin'
    });

    // Store password hash securely (in a real app, use proper password management)
    // For now, we'll use Base44's built-in authentication

    return Response.json({
      success: true,
      userId: newAdmin.id,
      email: newAdmin.email,
      message: 'Admin user created successfully. They can now log in with their Base44 credentials.'
    });

  } catch (error) {
    console.error('Create admin user error:', error);
    return Response.json({ error: error.message || 'Failed to create admin user' }, { status: 500 });
  }
});