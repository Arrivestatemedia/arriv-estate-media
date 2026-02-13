import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const hashPassword = async (password) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accountId, email, phoneNumber, password } = await req.json();

    if (!accountId) {
      return Response.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    const updateData = {};

    // Update email if provided
    if (email) {
      const existingUsers = await base44.asServiceRole.entities.PendingSignup.filter({
        email: email.toLowerCase(),
      });

      if (existingUsers.length > 0 && existingUsers[0].id !== accountId) {
        return Response.json(
          { error: 'Email is already registered' },
          { status: 409 }
        );
      }
      updateData.email = email.toLowerCase();
    }

    // Update phone number if provided
    if (phoneNumber) {
      updateData.phone_number = phoneNumber;
    }

    // Update password if provided
    if (password) {
      const hashedPassword = await hashPassword(password);
      updateData.password_hash = hashedPassword;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return Response.json(
        { error: 'No data to update' },
        { status: 400 }
      );
    }

    // Update the account
    await base44.asServiceRole.entities.PendingSignup.update(accountId, updateData);

    return Response.json({
      success: true,
      message: 'Account updated successfully',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});