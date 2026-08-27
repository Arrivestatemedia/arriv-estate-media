import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createTavusConversation, getTavusConversation } from '../../shared/tavusInterview.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const apiKey = Deno.env.get('TAVUS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'TAVUS_API_KEY not configured' }, { status: 500 });
    }

    const { roomName } = await req.json();
    if (!roomName) {
      return Response.json({ error: 'roomName is required' }, { status: 400 });
    }

    // Find the Conference by room_name (the existing join key)
    const conferences = await base44.asServiceRole.entities.Conference.filter({ room_name: roomName });
    const conference = conferences?.[0];
    if (!conference) {
      return Response.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Verify interview mode is AI — prevents creating Tavus conversations for human interviews
    if (conference.interview_mode !== 'ai') {
      return Response.json({ error: 'This interview is not configured for AI mode' }, { status: 403 });
    }

    // Idempotency: if already completed, don't create a new conversation
    if (conference.tavus_conversation_status === 'ended' || conference.status === 'completed') {
      return Response.json({
        error: 'This interview has already been completed',
        completed: true,
      }, { status: 409 });
    }

    // Idempotency: reuse existing active conversation if valid
    if (conference.tavus_conversation_id) {
      try {
        const existing = await getTavusConversation(apiKey, conference.tavus_conversation_id);
        if (existing && (existing.status === 'active' || existing.status === 'ready')) {
          return Response.json({
            conversation_id: existing.conversation_id,
            conversation_url: existing.conversation_url,
            meeting_token: conference.tavus_meeting_token || existing.meeting_token || null,
            reused: true,
          });
        }
      } catch (_e) {
        // Conversation may have ended or not found — create a new one
        console.log('Existing Tavus conversation not reusable, creating new one');
      }
    }

    // Build callback URL for Tavus webhooks
    const appDomain = Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app';
    const callbackUrl = `${appDomain}/functions/tavusInterviewCallback`;

    // Create new Tavus conversation
    const conversationName = `Arriv Interview - ${conference.title || conference.room_name}`;
    const tavusConv = await createTavusConversation(apiKey, {
      conversationName,
      callbackUrl,
      requireAuth: true,
      maxParticipants: 2,
    });

    // Store the Tavus conversation info on the Conference
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      tavus_conversation_id: tavusConv.conversation_id,
      tavus_meeting_token: tavusConv.meeting_token || null,
      tavus_conversation_status: tavusConv.status || 'active',
      tavus_started_at: new Date().toISOString(),
    });

    return Response.json({
      conversation_id: tavusConv.conversation_id,
      conversation_url: tavusConv.conversation_url,
      meeting_token: tavusConv.meeting_token || null,
      reused: false,
    });
  } catch (error) {
    console.error('createTavusInterviewConversation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});