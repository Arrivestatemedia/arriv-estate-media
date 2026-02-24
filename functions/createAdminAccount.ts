import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import crypto from 'crypto';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate a random password for the admin account
    const randomPassword = crypto.randomBytes(12).toString('hex');
    const passwordHash = crypto.createHash('sha256').update(randomPassword).digest('hex');

    // Check if admin account already exists
    const existingAdmin = await base44.entities.SalesTeamMember.filter({
      email: user.email,
      role: 'admin'
    });

    if (existingAdmin.length > 0) {
      // Return the existing admin account info
      return Response.json({
        success: true,
        message: 'Admin account already exists',
        admin_id: existingAdmin[0].id,
        email: user.email,
        temporary_password: randomPassword
      });
    }

    // Create admin account in SalesTeamMember database
    const adminAccount = await base44.entities.SalesTeamMember.create({
      email: user.email,
      full_name: user.full_name,
      password_hash: passwordHash,
      is_active: true,
      role: 'admin',
      chat_status: 'online'
    });

    return Response.json({
      success: true,
      message: 'Admin account created',
      admin_id: adminAccount.id,
      email: user.email,
      temporary_password: randomPassword
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});