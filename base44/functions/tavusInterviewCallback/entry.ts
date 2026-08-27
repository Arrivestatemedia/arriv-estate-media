import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseTranscriptToScorecard } from '../../shared/tavusInterview.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { conversation_id, event_type, properties, message_type, timestamp } = body;

    console.log('Tavus callback received:', { conversation_id, event_type, message_type });

    if (!conversation_id || !event_type) {
      return Response.json({ status: 'ignored', reason: 'missing fields' }, { status: 200 });
    }

    // Resolve the Conference by Tavus conversation_id — never trust browser-supplied IDs
    const conferences = await base44.asServiceRole.entities.Conference.filter({ tavus_conversation_id: conversation_id });
    const conference = conferences?.[0];
    if (!conference) {
      console.log('No conference found for Tavus conversation_id:', conversation_id);
      return Response.json({ status: 'ignored', reason: 'no conference' }, { status: 200 });
    }

    // ─── Handle conversation state changes ──────────────────────────────────
    if (event_type === 'system.pal_joined' || event_type === 'system.replica_joined') {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: 'active',
        status: 'in_progress',
      });
    } else if (event_type === 'system.shutdown') {
      const shutdownReason = properties?.shutdown_reason || 'unknown';
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: 'ended',
        tavus_completed_at: new Date().toISOString(),
        status: 'completed',
      });
      console.log(`Tavus conversation ${conversation_id} ended: ${shutdownReason}`);
    }

    // ─── Handle transcript ready ────────────────────────────────────────────
    if (event_type === 'application.transcription_ready') {
      // Idempotency: check if transcript already stored for this conversation + event
      const existingTranscripts = await base44.asServiceRole.entities.TavusInterviewTranscript.filter({
        conversation_id,
        event_type,
      });
      if (existingTranscripts && existingTranscripts.length > 0) {
        console.log('Transcript already stored for conversation:', conversation_id);
        return Response.json({ status: 'duplicate', reason: 'transcript already stored' }, { status: 200 });
      }

      const transcript = properties?.transcript || [];

      // Try to find linked JobApplication / HireCandidate via participant email
      let applicationId: string | null = null;
      let candidateId: string | null = null;
      let candidateName = '';
      const participantEmail = conference.participants?.find((p: any) => p.email)?.email;
      if (participantEmail) {
        try {
          const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: participantEmail });
          if (apps?.[0]) {
            applicationId = apps[0].id;
            candidateName = apps[0].full_name || '';
          }
        } catch (_) {}
        try {
          const candidates = await base44.asServiceRole.entities.HireCandidate.filter({ email: participantEmail });
          if (candidates?.[0]) {
            candidateId = candidates[0].id;
            if (!candidateName) candidateName = candidates[0].name || '';
          }
        } catch (_) {}
      }

      // Persist the original transcript (never overwritten by summaries)
      const transcriptRecord = await base44.asServiceRole.entities.TavusInterviewTranscript.create({
        conference_id: conference.id,
        conversation_id,
        application_id: applicationId,
        candidate_id: candidateId,
        candidate_name: candidateName,
        transcript,
        raw_payload: body,
        event_type,
        status: 'completed',
        received_at: new Date().toISOString(),
      });

      // ─── Parse transcript → existing questionnaire ─────────────────────────
      try {
        const parsed = await parseTranscriptToScorecard(base44, transcript);
        const { scorecard, allAnswered, avgConfidence, validCount } = parsed;

        const reviewRequired = !allAnswered || avgConfidence < 0.6;

        // Update the transcript record with parsed responses
        await base44.asServiceRole.entities.TavusInterviewTranscript.update(transcriptRecord.id, {
          parsed_scorecard: scorecard,
          parsing_confidence: avgConfidence,
          review_required: reviewRequired,
          scorecard_saved: !reviewRequired,
        });

        // Save the scorecard to the Conference (existing storage path)
        const conferenceUpdates: any = {
          round1_scorecard: scorecard,
          tavus_review_required: reviewRequired,
          tavus_scorecard_saved: !reviewRequired,
        };
        if (!reviewRequired) {
          conferenceUpdates.scorecard_completed_at = new Date().toISOString();
        }
        await base44.asServiceRole.entities.Conference.update(conference.id, conferenceUpdates);

        // If linked to a HireCandidate, also save to their round1_scorecard (existing path)
        if (candidateId && !reviewRequired) {
          try {
            await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
              round1_scorecard: scorecard,
              status: 'interviewing',
            });
          } catch (_) {}
        }

        console.log(`Tavus transcript parsed: ${validCount} valid responses, reviewRequired=${reviewRequired}`);
      } catch (parseError) {
        console.error('Failed to parse Tavus transcript:', parseError);
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_review_required: true,
        });
      }
    }

    // ─── Handle recording ready (optional, for future use) ──────────────────
    if (event_type === 'application.recording_ready') {
      console.log('Tavus recording ready for conversation:', conversation_id);
    }

    return Response.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('tavusInterviewCallback error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});