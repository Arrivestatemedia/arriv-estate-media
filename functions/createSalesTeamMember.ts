import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email, full_name, phone_number, password } = await req.json();

    if (!email || !full_name || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Hash password using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Create sales team member
    const member = await base44.asServiceRole.entities.SalesTeamMember.create({
      email,
      full_name,
      phone_number: phone_number || '',
      password_hash: passwordHash,
      is_active: true
    });

    return Response.json({ 
      success: true,
      memberId: member.id,
      message: 'Sales team member created successfully'
    });

  } catch (error) {
    console.error('Create sales team member error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});