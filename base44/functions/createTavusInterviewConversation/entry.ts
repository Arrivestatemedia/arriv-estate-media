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

    // ── 15-Minute Interview Structure ──────────────────────────────────────────
    // Ashley must complete all 8 questions within ~15 minutes. The structure is:
    //   ~1 min  — greeting and process intro
    //   10-11 min — 8 core questions (mandatory, in order)
    //   2-3 min — candidate questions
    //   ~1 min  — closing/buffer
    //
    // Completing all 8 core questions takes PRIORITY over follow-up questions.
    // One brief clarification per question is permitted when genuinely necessary;
    // otherwise record the evidence and move on immediately.
    // Do NOT coach weak responses. Do NOT let the candidate derail or end early.
    // If the 15-minute limit is reached before all 8 questions are asked, mark
    // the interview incomplete rather than skipping or scoring unanswered questions.
    const completionDirective = ` INTERVIEW STRUCTURE — 15 MINUTES TOTAL: You have exactly 15 minutes. Follow this structure strictly: (1) ~1 minute greeting and brief process intro; (2) 10-11 minutes for the 8 core questions below — ASK ALL 8 IN ORDER, this is mandatory; (3) 2-3 minutes for candidate questions; (4) ~1 minute closing. The 8 core questions are: Q1: "Give me a quick overview of yourself, your experience, and what interested you in this opportunity with Arriv." Q2: "Tell me about a challenging situation at work, school, or in another responsibility — what happened, what did you do, and what was the outcome?" Q3: "Tell me about a time you received feedback or constructive criticism — what was the feedback, and what did you do differently afterward?" Q4: "Tell me about a disagreement or difficult interaction with someone you worked with — how did you handle it?" Q5: "When you're given a problem you've never encountered before and don't have all the information, how do you figure out what to do?" Q6: "Tell me about a time you took initiative or went beyond what was expected of you." Q7: "How do you keep yourself organized and accountable when you're responsible for multiple things without someone constantly checking on you?" Q8: "What kind of work environment and management style help you perform at your best, and what are you hoping to find at Arriv?" RULES: Completing all 8 questions takes priority over follow-up questions. Allow at most ONE brief clarification per question only when genuinely needed — otherwise record the evidence and move to the next question immediately. Do not coach weak responses. If the candidate tries to end early or defer to the founder, warmly redirect: "Before we wrap up, I have a couple more quick questions." After all 8 questions, ask: "Those are all of my questions — before we wrap up, what questions do you have for me about Arriv Estate Media, the position, or our interview process?"`;

    const reconnectDirective = isReconnect
      ? ` This is a resumed session after a disconnection. Do not repeat questions that were already asked in the prior session (the resume briefing above lists those). Pick up with the next unanswered question and complete all remaining questions before closing.`
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