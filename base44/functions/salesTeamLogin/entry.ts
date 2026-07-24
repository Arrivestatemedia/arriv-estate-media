import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20'; // v2

Deno.serve(async (req) => {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Hash password using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create base44 client with service role
    const base44 = createClientFromRequest(req);

    // Find sales team member by email
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });

    if (!members || members.length === 0) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const member = members[0];

    // Check if member is active
    if (member.is_active === false) {
      return Response.json({ error: 'This account is inactive' }, { status: 403 });
    }

    // Verify password
    if (member.password_hash !== passwordHash) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    return Response.json({
      success: true,
      memberId: member.id,
      name: member.full_name,
      email: member.email,
      role: member.role || 'user',
      forcePasswordChange: member.force_password_change === true
    });

  } catch (error) {
    console.error('Sales team login error:', error.message, error.stack);
    return Response.json({ success: false, error: error.message || 'Login failed' }, { status: 500 });
  }
});