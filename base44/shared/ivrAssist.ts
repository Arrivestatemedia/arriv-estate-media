/**
 * Attempt to create an Arriv Assist ticket for an IVR technical-support record.
 *
 * Arriv Assist is the only authority for ticket numbering. This function never
 * invents a ticket: an unavailable transport or a refused call leaves the issue
 * as "ticket_pending" with the plain-language reason attached.
 */

import {
  isAssistConfigured,
  startAssistConversation,
  createAssistTicket,
} from './arrivAssistClient.ts';

export type AssistAttempt = {
  available: boolean;
  ticketId?: string;
  ticketNumber?: string;
  error?: string;
};

export async function attemptAssistTicket(
  base44: any,
  secrets: any,
  issue: {
    summary: string;
    caller_name?: string;
    caller_email?: string;
    caller_number?: string;
    receiving_number?: string;
    category?: string;
  }
): Promise<AssistAttempt> {
  if (!isAssistConfigured(secrets)) {
    return { available: false, error: 'Arriv Assist is not configured for this app.' };
  }

  const auth = {
    actor_user_id: 'ivr_caller',
    actor_email: issue.caller_email || '',
    actor_role: 'caller',
    tenant_id: 'tnt_estate_media',
    user_display_name: issue.caller_name || issue.caller_number || 'Caller',
    user_type: 'caller',
    is_platform_authority: false,
  };

  try {
    const conversation = await startAssistConversation(
      secrets,
      {
        role: 'user',
        content: issue.summary || 'Technical support voicemail left on the Arriv phone line.',
        page_context: {
          source: 'ivr_voicemail',
          receiving_number: issue.receiving_number || '',
          caller_number: issue.caller_number || '',
          category: issue.category || 'technical_support',
        },
        metadata: { channel: 'phone' },
      },
      { ...auth, actor_role: 'user' } as any
    );

    if (!conversation?.available || !conversation?.conversation_id) {
      return {
        available: false,
        error: conversation?.reason || 'Arriv Assist did not accept the conversation.',
      };
    }

    const ticket = await createAssistTicket(
      secrets,
      conversation.conversation_id,
      'L3',
      issue.summary || 'Technical support voicemail',
      auth as any
    );

    if (!ticket?.available || !ticket?.ticket_number) {
      return {
        available: false,
        error: ticket?.reason || 'Arriv Assist did not confirm a ticket.',
      };
    }

    return {
      available: true,
      ticketId: ticket.ticket_id,
      ticketNumber: ticket.ticket_number,
    };
  } catch (e) {
    return { available: false, error: (e as Error).message };
  }
}