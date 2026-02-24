import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { twilio_phone_number, sales_member_email } = await req.json();

    if (!twilio_phone_number) {
      return Response.json({ valid: false, error: 'Phone number required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Get all sales team members with this phone number
    const membersWithPhone = await base44.asServiceRole.entities.SalesTeamMember.filter({
      twilio_phone_number
    });

    // Phone number is locked to John Smith (Sample@arrivestatemedia.com)
    const RESERVED_PHONE = '+16789408294';
    const RESERVED_EMAIL = 'sample@arrivestatemedia.com';

    if (twilio_phone_number === RESERVED_PHONE) {
      // Only allow this phone for the reserved email
      if (sales_member_email?.toLowerCase() === RESERVED_EMAIL) {
        return Response.json({ valid: true });
      }
      return Response.json({ 
        valid: false, 
        error: 'This phone number is reserved and cannot be reassigned' 
      }, { status: 403 });
    }

    // Check if phone is already assigned to someone else
    if (membersWithPhone.length > 0) {
      const assignedTo = membersWithPhone[0];
      if (assignedTo.email?.toLowerCase() !== sales_member_email?.toLowerCase()) {
        return Response.json({ 
          valid: false, 
          error: `Phone number already assigned to ${assignedTo.full_name}` 
        }, { status: 409 });
      }
    }

    return Response.json({ valid: true });

  } catch (error) {
    console.error('Phone validation error:', error);
    return Response.json({ error: error.message || 'Validation failed' }, { status: 500 });
  }
});