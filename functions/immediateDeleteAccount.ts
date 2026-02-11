import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token, email } = await req.json();

    if (!token || !email) {
      return Response.json(
        { error: 'Token and email are required' },
        { status: 400 }
      );
    }

    // Find user with matching token
    const users = await base44.asServiceRole.entities.PendingSignup.filter({
      email: email.toLowerCase(),
      deletion_token: token,
    });

    if (users.length === 0) {
      return Response.json(
        { error: 'Invalid token or email' },
        { status: 401 }
      );
    }

    const user = users[0];

    // Delete the user
    await base44.asServiceRole.entities.PendingSignup.delete(user.id);

    return Response.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});