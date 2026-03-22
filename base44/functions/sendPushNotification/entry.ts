import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipientId, title, body, tag } = await req.json();

    // Get user's push subscriptions
    const subscriptions = await base44.asServiceRole.entities.PushSubscription.filter({
      user_id: recipientId,
      active: true
    });

    if (!subscriptions || subscriptions.length === 0) {
      return Response.json({ success: true, message: 'No active subscriptions' });
    }

    const payload = JSON.stringify({
      title,
      body,
      tag,
      icon: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png'
    });

    // Note: In production, you'd use a web push library like web-push
    // For now, we'll store the notification to be picked up by the frontend
    // The frontend will poll for pending notifications
    
    for (const sub of subscriptions) {
      try {
        // Create notification record
        await base44.asServiceRole.entities.PendingNotification.create({
          user_id: recipientId,
          title,
          body,
          tag,
          sent_at: new Date().toISOString()
        });
      } catch (e) {
        console.error('Error creating notification:', e);
      }
    }

    return Response.json({ success: true, sent: subscriptions.length });
  } catch (error) {
    console.error('Error sending push notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});