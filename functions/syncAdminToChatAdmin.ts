import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { userId, email, full_name, chat_status } = await req.json();

    if (!userId || !email || !full_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if ChatAdmin record exists for this email
    const existing = await base44.asServiceRole.entities.ChatAdmin.filter({ email }).catch(() => []);

    if (existing && existing.length > 0) {
      // Update existing
      await base44.asServiceRole.entities.ChatAdmin.update(existing[0].id, {
        chat_status: chat_status || 'online',
        full_name,
        email
      });
    } else {
      // Create new
      await base44.asServiceRole.entities.ChatAdmin.create({
        email,
        full_name,
        chat_status: chat_status || 'online'
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});