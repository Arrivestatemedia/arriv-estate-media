import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { endTavusConversation } from '../../shared/tavusInterview.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { roomName } = await req.json();
    if (!roomName) {
      return Response.json({ error: 'roomName is required' }, { status: 400 });
    }

    // Find the Conference by room_name
    const conferences = await base44.asServiceRole.entities.Conference.filter({ room_name: roomName });
    const conference = conferences?.[0];
    if (!conference) {
      return Response.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Only end if it's an AI interview with an active Tavus conversation
    if (conference.interview_mode !== 'ai' || !conference.tavus_conversation_id) {
      return Response.json({ error: 'Not an active AI interview' }, { status: 400 });
    }

    // Don't end if already completed
    if (conference.tavus_conversation_status === 'ended') {
      return Response.json({ status: 'already_ended' }, { status: 200 });
    }

    const apiKey = Deno.env.get('TAVUS_API_KEY');
    if (apiKey) {
      try {
        await endTavusConversation(apiKey, conference.tavus_conversation_id);
      } catch (e) {
        console.error('Tavus end API call failed (callback will handle completion):', e);
      }
    }

    // Update Conference status
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      tavus_conversation_status: 'ended',
      tavus_completed_at: new Date().toISOString(),
      status: 'completed',
    });

    return Response.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('endTavusInterview error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});