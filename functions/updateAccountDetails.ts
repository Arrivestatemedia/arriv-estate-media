import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accountId, email, phoneNumber } = await req.json();

    if (!accountId || !email || !phoneNumber) {
      return Response.json(
        { error: 'Account ID, email, and phone number are required' },
        { status: 400 }
      );
    }

    // Check if new email is already in use (if changing email)
    const existingUsers = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email.toLowerCase(),
    });

    if (existingUsers.length > 0 && existingUsers[0].id !== accountId) {
      return Response.json(
        { error: 'Email is already registered' },
        { status: 409 }
      );
    }

    // Update the account
    await base44.asServiceRole.entities.PendingSignup.update(accountId, {
      email: email.toLowerCase(),
      phone_number: phoneNumber,
    });

    return Response.json({
      success: true,
      message: 'Account updated successfully',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});