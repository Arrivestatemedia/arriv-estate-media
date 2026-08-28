import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createTavusConversation, getTavusConversation, endTavusConversation, getTavusConversationTranscript, buildResumeBriefing } from "../../shared/tavusInterview.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    // Find the conference by room_name
    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { room_name: roomName },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    if (conference.interview_mode !== "ai") {
      return Response.json({ error: "This interview is not configured for AI mode" }, { status: 403 });
    }

    // If we already have a conversation, check if it's still active
    if (conference.tavus_conversation_id) {
      try {
        const existing = await getTavusConversation(conference.tavus_conversation_id);
        if (existing && existing.status !== "ended" && existing.conversation_url) {
          return Response.json({
            status: "success",
            conversationId: existing.conversation_id || conference.tavus_conversation_id,
            conversationUrl: existing.conversation_url,
            meetingToken: conference.tavus_meeting_token || existing.meeting_token,
            reused: true,
          });
        }
        // Conversation exists but is ended/stale — end it server-side to free
        // up the concurrent conversation slot before creating a new one.
        try {
          await endTavusConversation(conference.tavus_conversation_id);
        } catch (_) {}
      } catch (e) {
        console.warn("Failed to check existing conversation, creating new:", e.message);
      }
    }

    // Create a new Tavus conversation.
    // Pass the candidate's email as a stable memory store so the PAL (Ashley)
    // can remember the candidate across interviews and welcome them back.
    const candidateEmail = conference.participants?.[0]?.email || "";
    const candidateName = conference.participants?.[0]?.name || "";
    const memoryStore = candidateEmail
      ? `arriv-candidate-${candidateEmail.toLowerCase().trim()}`
      : undefined;
    const conversationName = `Arriv Interview - ${conference.title || roomName}`;

    // If this is a reconnect (a previous conversation existed but ended),
    // give Ashley a custom greeting so she acknowledges the drop instead of
    // restarting the interview from her default greeting. We also fetch the
    // prior transcript and build a resume briefing so she knows exactly which
    // questions were already asked and where to pick up.
    const isReconnect = !!conference.tavus_conversation_id;
    const firstName = candidateName ? candidateName.split(" ")[0] : "";

    let customGreeting: string | undefined;
    if (isReconnect) {
      let resumeBriefing: string | null = null;
      const oldConvId = conference.tavus_conversation_id;

      // 1. Try our stored transcript entity first (most reliable)
      try {
        const storedRes = await base44.asServiceRole.entities.TavusInterviewTranscript.filter(
          { conversation_id: oldConvId },
          "-created_date",
          1
        );
        const stored = Array.isArray(storedRes?.data ?? storedRes) ? (storedRes?.data ?? storedRes)[0] : null;
        if (stored?.transcript && Array.isArray(stored.transcript) && stored.transcript.length > 0) {
          resumeBriefing = await buildResumeBriefing(base44, stored.transcript, candidateName);
        }
      } catch (e) {
        console.warn("Failed to fetch stored transcript:", e.message);
      }

      // 2. Fall back to the Tavus verbose API
      if (!resumeBriefing && oldConvId) {
        try {
          const apiTranscript = await getTavusConversationTranscript(oldConvId);
          if (apiTranscript && apiTranscript.length > 0) {
            resumeBriefing = await buildResumeBriefing(base44, apiTranscript, candidateName);
          }
        } catch (e) {
          console.warn("Failed to fetch transcript from Tavus API:", e.message);
        }
      }

      const welcomeBack = `Welcome back${firstName ? " " + firstName : ""}, sorry about that, I don't know what happened!`;
      customGreeting = resumeBriefing
        ? `${welcomeBack} ${resumeBriefing}`
        : welcomeBack;
    }

    // Feed Ashley the candidate's identity as conversational context so she can
    // greet them by name on the FIRST interview (the PAL reads this as background
    // info and weaves the name into her own greeting). On reconnects the
    // custom_greeting still takes over as the spoken greeting, but we also add a
    // standing instruction that she MUST ask every remaining unanswered Round 1
    // question before wrapping up — the candidate cannot defer to a later call.
    const baseContext = candidateName
      ? `You are about to interview a candidate named ${candidateName}. Their first name is ${firstName}. Please greet them personally by their first name when they join. This is a first-round interview for the Sales Growth Advisor role at Arriv Estate Media.`
      : `This is a first-round interview for the Sales Growth Advisor role at Arriv Estate Media.`;
    // Standing rule for EVERY session: Ashley must ask every Round 1 scorecard
    // question before wrapping up. On reconnects she additionally must not
    // repeat already-answered questions (the resume briefing lists those).
    const completionDirective = ` IMPORTANT: You must ask every question on the Round 1 scorecard before you wrap up the interview — do not close early just because the candidate says they have no more questions or wants to defer answers to a later call with the founder. If the candidate tries to end early, politely insist on covering the remaining questions first. Only once every question has been answered may you close the interview.`;
    const reconnectDirective = isReconnect
      ? ` This is a resumed session after a disconnection. Do not repeat questions that were already answered in the prior session (the resume briefing lists those). Ask every remaining unanswered Round 1 question before wrapping up.`
      : "";
    const conversationalContext = `${baseContext}${completionDirective}${reconnectDirective}`;

    const tavusRes = await createTavusConversation({
      conversationName,
      requireAuth: true,
      maxParticipants: 2,
      memoryStore,
      customGreeting,
      conversationalContext,
    });

    const conversationId = tavusRes.conversation_id;
    const conversationUrl = tavusRes.conversation_url;
    const meetingToken = tavusRes.meeting_token;

    if (!conversationUrl) {
      throw new Error("Tavus did not return a conversation_url");
    }

    // Persist conversation details on the conference
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      tavus_conversation_id: conversationId,
      tavus_conversation_status: "active",
      tavus_started_at: new Date().toISOString(),
      tavus_meeting_token: meetingToken || null,
    });

    return Response.json({
      status: "success",
      conversationId,
      conversationUrl,
      meetingToken,
      reused: false,
    });
  } catch (error) {
    console.error("createTavusInterviewConversation error:", error.message);
    return Response.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
});