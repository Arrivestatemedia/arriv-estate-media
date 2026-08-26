import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20'; // v2
import { handleSalesBackgroundCheckFailure } from '../../shared/orientationEngine.ts';

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

    // Find sales team member by email (case-insensitive — SalesTeamMember emails
    // may have mixed-case casing that doesn't match the login input)
    let members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });
    if (!members || members.length === 0) {
      const allMembers = await base44.asServiceRole.entities.SalesTeamMember.list();
      members = (allMembers || []).filter(m => m.email && m.email.toLowerCase() === email.toLowerCase());
    }

    if (!members || members.length === 0) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const member = members[0];

    // Verify password
    if (member.password_hash !== passwordHash) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Background check gate: sales reps cannot access the system until their background
    // check clears. Admins bypass. A failed background check rescinds the offer and
    // deactivates the account (idempotent). Reps without an orientation record (legacy)
    // are allowed through.
    if (member.role !== 'admin') {
      let bgStatus = null;
      let bgOrientation = null;
      try {
        const orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ sales_member_id: member.id });
        if (orientations && orientations.length > 0) {
          // If ANY orientation has a clear background check, the rep is cleared.
          // (Reps may have multiple orientation records from re-invitations.)
          const cleared = orientations.find(o => o.background_check_status === 'clear');
          if (cleared) {
            bgStatus = 'clear';
            bgOrientation = cleared;
          } else {
            // Otherwise use the most recently updated orientation
            const failed = orientations.find(o => o.background_check_status === 'failed');
            if (failed) {
              bgStatus = 'failed';
              bgOrientation = failed;
            } else {
              bgStatus = orientations[0].background_check_status;
              bgOrientation = orientations[0];
            }
          }
        }
      } catch (e) { /* no orientation = legacy rep, allow */ }

      if (bgStatus === 'failed') {
        try { if (bgOrientation) await handleSalesBackgroundCheckFailure(base44, bgOrientation); } catch (e) { /* ignore */ }
        return Response.json({ error: 'Your background check did not pass. We are unable to move forward with your offer at this time. You will receive an email with more information.', background_check_failed: true }, { status: 403 });
      }
      if (bgStatus === 'pending' || bgStatus === 'not_started' || bgStatus === 'requires_review') {
        return Response.json({ error: "Your background check is still being processed. You'll be able to access the sales system once it clears. If you have questions, contact careers@arrivestatemedia.com.", background_check_pending: true }, { status: 403 });
      }
    }

    // Check if member is active
    if (member.is_active === false) {
      return Response.json({ error: 'This account is inactive' }, { status: 403 });
    }

    // Link the platform user to this sales team member so per-rep RLS
    // (ActivityLog / Contact / Deal read rules keyed on {{user.data.sales_member_id}})
    // can identify the rep. Matches case-insensitively by email.
    // Also check if the platform user is an admin — if so, return admin role
    // so the Layout shows the admin navigation.
    let platformRole: string | null = null;
    try {
      const allUsers = await base44.asServiceRole.entities.User.list();
      const platformUser = allUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
      if (platformUser) {
        if (platformUser.data?.sales_member_id !== member.id) {
          await base44.asServiceRole.entities.User.update(platformUser.id, { sales_member_id: member.id });
        }
        if (platformUser.role === 'admin') {
          platformRole = 'admin';
        }
      }
    } catch (e) { /* non-critical — RLS simply won't resolve for this session */ }

    return Response.json({
      success: true,
      memberId: member.id,
      name: member.full_name,
      email: member.email,
      role: platformRole || member.role || 'user',
      forcePasswordChange: member.force_password_change === true
    });

  } catch (error) {
    console.error('Sales team login error:', error.message, error.stack);
    return Response.json({ success: false, error: error.message || 'Login failed' }, { status: 500 });
  }
});