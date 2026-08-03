import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, data } = body || {};

    if (action === 'list') {
      const res = await base44.entities.AskKhethaConversation.filter(
        { user_email: user.email },
        '-last_message_at',
        50
      );
      const conversations = res?.data ?? res ?? [];
      return Response.json({ conversations });
    }

    if (action === 'send') {
      const { request: userMessage, conversation_id } = data || {};
      if (!userMessage || !userMessage.trim()) {
        return Response.json({ error: 'Message is required' }, { status: 400 });
      }

      let conversation;
      const now = new Date().toISOString();
      const userMsg = {
        role: 'user',
        content: userMessage.trim(),
        timestamp: now,
      };

      if (conversation_id) {
        const res = await base44.entities.AskKhethaConversation.filter({ conversation_id });
        const existing = (res?.data ?? res ?? [])[0];
        if (existing) {
          conversation = existing;
          conversation.messages = [...(conversation.messages || []), userMsg];
        }
      }

      if (!conversation) {
        const newConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const title = userMessage.trim().substring(0, 50) + (userMessage.trim().length > 50 ? '...' : '');
        const createRes = await base44.entities.AskKhethaConversation.create({
          conversation_id: newConvId,
          title,
          user_id: user.id,
          user_email: user.email,
          messages: [userMsg],
          created_from: 'standalone',
          last_message_at: now,
        });
        conversation = createRes?.data ?? createRes;
      }

      // Generate AI response using InvokeLLM
      const systemPrompt = `You are Khetha, an AI recruiting assistant for Arriv Estate Media. You help with:
- Job posting creation and role profiling
- Candidate evaluation and scoring
- Interview scorecards and best practices
- Recruiting strategy and talent sourcing
- Hiring decisions and evidence-based recommendations

Be concise, practical, and actionable. When suggesting actions, include them as structured actions.

Current user: ${user.full_name || user.email}`;

      const conversationContext = (conversation.messages || [])
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\nConversation so far:\n${conversationContext}\n\nRespond to the user's latest message. If you are suggesting concrete actions the user should take, format them as a JSON array in your response using this exact format at the end:\n[[ACTIONS]]\n[{"type":"ACTION_TYPE","description":"What to do"}]\n[[/ACTIONS]]\n\nKeep your response natural and helpful.`,
        response_json_schema: {
          type: "object",
          properties: {
            response: { type: "string" },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  description: { type: "string" }
                }
              }
            }
          }
        }
      });

      const llmData = llmRes?.data ?? llmRes;
      const aiContent = llmData?.response || llmData || 'I apologize, I could not generate a response.';
      const aiActions = llmData?.actions || [];

      const aiMsg = {
        role: 'assistant',
        content: aiContent,
        actions: aiActions,
        timestamp: new Date().toISOString(),
      };

      conversation.messages = [...(conversation.messages || []), aiMsg];
      conversation.last_message_at = aiMsg.timestamp;

      const updateRes = await base44.entities.AskKhethaConversation.update(conversation.id, {
        messages: conversation.messages,
        last_message_at: conversation.last_message_at,
      });
      const updated = updateRes?.data ?? updateRes ?? conversation;

      return Response.json({ conversation: updated });
    }

    if (action === 'delete') {
      const { conversation_id } = data || {};
      if (!conversation_id) return Response.json({ error: 'conversation_id required' }, { status: 400 });
      const res = await base44.entities.AskKhethaConversation.filter({ conversation_id });
      const existing = (res?.data ?? res ?? [])[0];
      if (existing) {
        await base44.entities.AskKhethaConversation.delete(existing.id);
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}