// manageSupportConversation — Arriv Assist conversation delegate
//
// AUTHORITY: Arriv Assist is the SOLE canonical owner of:
//   - SupportAgent registry + agent assignment
//   - AssistConversation records
//   - AssistTicket (AST-####) numbering + records
//
// This function is a THIN DELEGATE: it forwards message/ticket/context
// requests to the separate Arriv Assist application via the cross-app HMAC
// transport. It stores a LOCAL NON-CANONICAL reference (SupportConversation)
// only to cache the canonical agent display info and preserve UI continuity
// across refresh. It NEVER invents agents, NEVER assigns a local agent, and
// NEVER creates a competing ticket numbering system.
//
// When Arriv Assist is not configured or unreachable, every action returns
// { status: "unavailable" } — the host app surfaces an honest
// "temporarily unavailable" state and does NOT fabricate a fallback agent.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  resolveSupportAuthority,
  type SupportAuthority,
} from "../../shared/supportCapabilityRegistry.ts";
import {
  isAssistConfigured, getAssistEndpoint, fetchAssistHealth,
  listAssistAgents, validateAssistAgentId,
  startAssistConversation,
  sendAssistMessage, getAssistConversation,
  closeAssistConversation,
  createAssistTicket, getAssistTicket,
  getAssistCapabilities, getAssistSupportContext,
} from "../../shared/arrivAssistClient.ts";

function unavailable(reason: string) {
  // Return HTTP 200 (not 503) so the SDK doesn't throw — the frontend
  // checks data.status === "unavailable" and handles it gracefully.
  return Response.json({ status: "unavailable", reason });
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    const auth: SupportAuthority = await resolveSupportAuthority(base44, {
      sales_member_id: body.sales_member_id,
      view_as_tenant_id: body.view_as_tenant_id,
    });
    if (!auth.ok) {
      return Response.json({ error: auth.error || "Authentication required" }, { status: 401 });
    }

    const assistReady = isAssistConfigured(secrets);
    const assistAuth = {
      actor_user_id: auth.actor_user_id,
      actor_email: auth.actor_email,
      actor_role: auth.actor_role,
      tenant_id: auth.tenant_id,
      user_display_name: auth.actor_display_name,
      user_type: auth.user_type,
      view_as_tenant_id: auth.view_as_tenant_id || undefined,
      is_platform_authority: auth.is_platform_authority,
    };

    switch (action) {

      // ==========================================================
      // getAvailability — honest transport health for the widget.
      // ==========================================================
      case "getAvailability": {
        if (!assistReady) return Response.json({ status: "ok", available: false, reason: "NOT_CONFIGURED" });
        // Health check is ADVISORY — cold-start 503s on the health endpoint
        // must NOT block the widget. If configured, the widget is available;
        // the actual message send has its own retry logic for transient failures.
        const health = await fetchAssistHealth(secrets);
        return Response.json({
          status: "ok",
          available: true,
          reason: null,
          identity: health.available ? {
            app_id: health.app_id,
            product_key: health.product_key,
            contract_version: health.contract_version,
          } : null,
          health_advisory: health.available ? null : health.reason,
        });
      }

      // ==========================================================
      // getActiveConversation — check for an existing local reference
      // and restore from Assist. Does NOT create a new conversation.
      // ==========================================================
      case "getActiveConversation": {
        const existing = await base44.asServiceRole.entities.SupportConversation
          .filter({ user_id: auth.actor_user_id, status: "active" }, "-last_message_at", 1)
          .catch(() => []);

        if (!existing || !existing[0]) {
          return Response.json({ status: "ok", conversation: null, messages: [] });
        }

        const conv = existing[0];

        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const assistConv = await getAssistConversation(secrets, conv.conversation_id, assistAuth);
        if (!assistConv.available) {
          if (assistConv.reason === "UNAUTHORIZED" || assistConv.reason === "CONVERSATION_NOT_FOUND") {
            await base44.asServiceRole.entities.SupportConversation.delete(conv.id).catch(() => {});
            return Response.json({ status: "ok", conversation: null, messages: [] });
          }
          return unavailable(assistConv.reason || "UNREACHABLE");
        }

        if (assistConv.support_agent_id) {
          const validation = await validateAssistAgentId(secrets, assistConv.support_agent_id, assistAuth);
          if (validation.reason === "UNAVAILABLE") return unavailable("ASSIST_UNREACHABLE");
          if (!validation.valid) {
            return Response.json({
              status: "diagnostic",
              reason: "UNKNOWN_AGENT",
              agent_id: assistConv.support_agent_id,
              message: "The assigned support agent could not be verified against Arriv Assist.",
            }, { status: 409 });
          }
        }

        const convStatus = (assistConv.status || "").toUpperCase();
        if (convStatus === "CLOSED") {
          await base44.asServiceRole.entities.SupportConversation.update(conv.id, {
            status: "closed",
          }).catch(() => {});
          return Response.json({
            status: "ok",
            conversation: null,
            messages: [],
            closed: true,
            closure_reason: assistConv.closure_reason || null,
            transcript_url: assistConv.transcript_url || null,
            transcript_offered: assistConv.transcript_offered ?? false,
            transcript_requested: assistConv.transcript_requested ?? false,
            transcript_ready: assistConv.transcript_ready ?? false,
            transcript_status: assistConv.transcript_status || null,
            customer_first_name: assistConv.customer_first_name || null,
            customer_last_name: assistConv.customer_last_name || null,
            customer_full_name: assistConv.customer_full_name || null,
            customer_preferred_name: assistConv.customer_preferred_name || null,
            customer_name_complete: assistConv.customer_name_complete ?? null,
            name_formality_preference: assistConv.name_formality_preference || null,
            customer_issue_summary: assistConv.customer_issue_summary || null,
            customer_phone: assistConv.customer_phone || null,
            customer_phone_normalized: assistConv.customer_phone_normalized || null,
            customer_phone_verified: assistConv.customer_phone_verified ?? null,
            customer_phone_source: assistConv.customer_phone_source || null,
            sms_notification_requested: assistConv.sms_notification_requested ?? null,
            sms_notification_ready: assistConv.sms_notification_ready ?? null,
            sms_notification_status: assistConv.sms_notification_status || null,
            ticket_created: assistConv.ticket_created ?? null,
          });
        }

        await base44.asServiceRole.entities.SupportConversation.update(conv.id, {
          support_agent_id: assistConv.support_agent_id || conv.support_agent_id,
          agent_name: assistConv.agent_name || conv.agent_name || "",
          agent_title: assistConv.agent_title || conv.agent_title || "",
          agent_avatar_initial: assistConv.agent_avatar_initial || conv.agent_avatar_initial || "",
          agent_avatar_url: assistConv.agent_avatar_url || conv.agent_avatar_url || "",
          page_context: body.page_context || conv.page_context,
        }).catch(() => {});

        return Response.json({
          status: "ok",
          conversation: {
            conversation_id: conv.conversation_id,
            status: assistConv.status || conv.status,
            support_agent_id: assistConv.support_agent_id || conv.support_agent_id,
            agent_name: assistConv.agent_name || conv.agent_name || "",
            agent_title: assistConv.agent_title || conv.agent_title || "",
            agent_avatar_initial: assistConv.agent_avatar_initial || conv.agent_avatar_initial || "",
            agent_avatar_url: assistConv.agent_avatar_url || conv.agent_avatar_url || "",
            ticket_id: assistConv.ticket_id || conv.ticket_id || null,
            ticket_number: assistConv.ticket_number || conv.assist_ticket_number || null,
            transcript_url: assistConv.transcript_url || null,
            transcript_offered: assistConv.transcript_offered ?? false,
            transcript_requested: assistConv.transcript_requested ?? false,
            transcript_ready: assistConv.transcript_ready ?? false,
            transcript_status: assistConv.transcript_status || null,
            agent_assignment_revision: assistConv.agent_assignment_revision ?? null,
            transfer_state: assistConv.transfer_state ?? null,
            agent_typing: assistConv.agent_typing ?? false,
            agent_state: assistConv.agent_state ?? null,
            state_updated_at: assistConv.state_updated_at ?? null,
            state_revision: assistConv.state_revision ?? null,
            current_agent_id: assistConv.current_agent_id ?? null,
            typing_indicator_enabled: assistConv.typing_indicator_enabled ?? null,
            typing_indicator_min_visible_ms: assistConv.typing_indicator_min_visible_ms ?? null,
            typing_indicator_max_visible_ms: assistConv.typing_indicator_max_visible_ms ?? null,
            customer_first_name: assistConv.customer_first_name || null,
            customer_last_name: assistConv.customer_last_name || null,
            customer_full_name: assistConv.customer_full_name || null,
            customer_preferred_name: assistConv.customer_preferred_name || null,
            customer_name_complete: assistConv.customer_name_complete ?? null,
            name_formality_preference: assistConv.name_formality_preference || null,
            customer_issue_summary: assistConv.customer_issue_summary || null,
            customer_phone: assistConv.customer_phone || null,
            customer_phone_normalized: assistConv.customer_phone_normalized || null,
            customer_phone_verified: assistConv.customer_phone_verified ?? null,
            customer_phone_source: assistConv.customer_phone_source || null,
            sms_notification_requested: assistConv.sms_notification_requested ?? null,
            sms_notification_ready: assistConv.sms_notification_ready ?? null,
            sms_notification_status: assistConv.sms_notification_status || null,
            ticket_created: assistConv.ticket_created ?? null,
          },
          messages: assistConv.messages || [],
        });
      }

      // ==========================================================
      // sendMessage — delegate to Arriv Assist. If no conversation_id,
      // this is the FIRST message: Assist creates the conversation
      // and assigns the canonical agent.
      // ==========================================================
      case "sendMessage": {
        if (!assistReady) return unavailable("NOT_CONFIGURED");

        let conversationId = body.conversation_id || null;
        let startAgent: { support_agent_id?: string; agent_name?: string } = {};

        if (!conversationId) {
          const startRes = await startAssistConversation(
            secrets,
            {
              role: body.role || "user",
              content: body.content || "",
              repair_state: body.repair_state || "none",
              capability_id: body.capability_id,
              page_context: body.page_context,
              metadata: body.metadata,
            },
            assistAuth
          );
          if (!startRes.available) return unavailable(startRes.reason || "UNREACHABLE");
          conversationId = startRes.conversation_id;
          startAgent = {
            support_agent_id: startRes.support_agent_id,
            agent_name: startRes.agent_name,
            agent_avatar_url: startRes.agent_avatar_url,
          };

          await base44.asServiceRole.entities.SupportConversation.create({
            conversation_id: conversationId,
            tenant_id: auth.tenant_id,
            user_id: auth.actor_user_id,
            user_type: auth.user_type,
            user_display_name: auth.actor_display_name,
            support_agent_id: startRes.support_agent_id || "",
            agent_name: startRes.agent_name || "",
            agent_title: "",
            agent_avatar_initial: (startRes.agent_name || "A").charAt(0).toUpperCase(),
            agent_avatar_url: startRes.agent_avatar_url || "",
            status: "active",
            page_context: body.page_context || null,
            view_as_tenant_id: auth.view_as_tenant_id || "",
            last_message_at: new Date().toISOString(),
            last_message_preview: (body.content || "").slice(0, 120),
          }).catch(() => {});
        }

        const r = await sendAssistMessage(
          secrets,
          {
            conversation_id: conversationId,
            role: body.role || "user",
            content: body.content || "",
            repair_state: body.repair_state || "none",
            capability_id: body.capability_id,
            ticket_number: body.ticket_number,
            metadata: body.metadata,
            page_context: body.page_context,
          },
          assistAuth
        );
        if (!r.available) {
          if (conversationId) {
            return Response.json({
              status: "unavailable",
              reason: r.reason || "UNREACHABLE",
              conversation_id: conversationId,
              support_agent_id: startAgent.support_agent_id || r.support_agent_id || "",
              agent_name: startAgent.agent_name || r.agent_name || "",
            });
          }
          return unavailable(r.reason || "UNREACHABLE");
        }

        const finalAgentName = r.agent_name || startAgent.agent_name || "";
        const finalSupportAgentId = r.support_agent_id || startAgent.support_agent_id || "";
        const finalAgentTitle = r.agent_title || "";
        const finalAgentAvatarInitial = r.agent_avatar_initial || finalAgentName.charAt(0).toUpperCase() || "A";
        const finalAgentAvatarUrl = r.agent_avatar_url || startAgent.agent_avatar_url || "";

        // CRITICAL: ALWAYS fetch full canonical message history (including
        // AGENT_JOINED and all prior messages) so the host renders canonical
        // chronology on every message — not just the first. sendAssistMessage
        // may only return the agent reply; getAssistConversation returns the
        // complete canonical timeline with correct sequence/timestamps for
        // all messages, preventing out-of-order rendering.
        try {
          const convRes = await getAssistConversation(secrets, conversationId, assistAuth);
          if (convRes.available && convRes.messages && convRes.messages.length > 0) {
            r.messages = convRes.messages;
            r.message = convRes.messages.find((m: any) => m.role === "agent") || r.message;
          }
        } catch {}

        if (body.conversation_id) {
          const localConvs = await base44.asServiceRole.entities.SupportConversation
            .filter({ conversation_id: conversationId }).catch(() => []);
          const local = localConvs?.[0];
          if (local) {
            await base44.asServiceRole.entities.SupportConversation.update(local.id, {
              last_message_at: new Date().toISOString(),
              last_message_preview: (body.content || "").slice(0, 120),
              ...(finalAgentName ? {
                agent_name: finalAgentName,
                agent_title: finalAgentTitle,
                agent_avatar_initial: finalAgentAvatarInitial,
                agent_avatar_url: finalAgentAvatarUrl,
                support_agent_id: finalSupportAgentId,
              } : {}),
            }).catch(() => {});
          }
        }

        const msgConvStatus = (r.conversation_status || "").toUpperCase();
        if (msgConvStatus === "CLOSED") {
          const localConvs2 = await base44.asServiceRole.entities.SupportConversation
            .filter({ conversation_id: conversationId }).catch(() => []);
          const local2 = localConvs2?.[0];
          if (local2) {
            await base44.asServiceRole.entities.SupportConversation.update(local2.id, {
              status: "closed",
            }).catch(() => {});
          }
          return Response.json({
            status: "ok",
            conversation_id: conversationId,
            support_agent_id: finalSupportAgentId,
            agent_name: finalAgentName,
            agent_title: finalAgentTitle,
            agent_avatar_initial: finalAgentAvatarInitial,
            agent_avatar_url: finalAgentAvatarUrl,
            message: r.message,
            messages: r.messages,
            closed: true,
            closure_reason: r.closure_reason || null,
            transcript_url: r.transcript_url || null,
            transcript_offered: r.transcript_offered ?? false,
            transcript_requested: r.transcript_requested ?? false,
            transcript_ready: r.transcript_ready ?? false,
            transcript_status: r.transcript_status || null,
            agent_assignment_revision: r.agent_assignment_revision ?? null,
            transfer_state: r.transfer_state ?? null,
            agent_typing: r.agent_typing ?? false,
            agent_state: r.agent_state ?? null,
            state_updated_at: r.state_updated_at ?? null,
            state_revision: r.state_revision ?? null,
            current_agent_id: r.current_agent_id ?? null,
            typing_indicator_enabled: r.typing_indicator_enabled ?? null,
            typing_indicator_min_visible_ms: r.typing_indicator_min_visible_ms ?? null,
            typing_indicator_max_visible_ms: r.typing_indicator_max_visible_ms ?? null,
            customer_first_name: r.customer_first_name || null,
            customer_last_name: r.customer_last_name || null,
            customer_full_name: r.customer_full_name || null,
            customer_preferred_name: r.customer_preferred_name || null,
            customer_name_complete: r.customer_name_complete ?? null,
            name_formality_preference: r.name_formality_preference || null,
            customer_issue_summary: r.customer_issue_summary || null,
            customer_phone: r.customer_phone || null,
            customer_phone_normalized: r.customer_phone_normalized || null,
            customer_phone_verified: r.customer_phone_verified ?? null,
            customer_phone_source: r.customer_phone_source || null,
            sms_notification_requested: r.sms_notification_requested ?? null,
            sms_notification_ready: r.sms_notification_ready ?? null,
            sms_notification_status: r.sms_notification_status || null,
            ticket_created: r.ticket_created ?? null,
          });
        }

        return Response.json({
          status: "ok",
          conversation_id: conversationId,
          support_agent_id: finalSupportAgentId,
          agent_name: finalAgentName,
          agent_title: finalAgentTitle,
          agent_avatar_initial: finalAgentAvatarInitial,
          agent_avatar_url: finalAgentAvatarUrl,
          message: r.message,
          messages: r.messages,
          conversation_status: r.conversation_status || null,
          closure_reason: r.closure_reason || null,
          transcript_url: r.transcript_url || null,
          transcript_offered: r.transcript_offered ?? false,
          transcript_requested: r.transcript_requested ?? false,
          transcript_ready: r.transcript_ready ?? false,
          transcript_status: r.transcript_status || null,
          customer_first_name: r.customer_first_name || null,
          customer_last_name: r.customer_last_name || null,
          customer_full_name: r.customer_full_name || null,
          customer_preferred_name: r.customer_preferred_name || null,
          customer_name_complete: r.customer_name_complete ?? null,
          name_formality_preference: r.name_formality_preference || null,
          customer_issue_summary: r.customer_issue_summary || null,
          customer_phone: r.customer_phone || null,
          customer_phone_normalized: r.customer_phone_normalized || null,
          customer_phone_verified: r.customer_phone_verified ?? null,
          customer_phone_source: r.customer_phone_source || null,
          sms_notification_requested: r.sms_notification_requested ?? null,
          sms_notification_ready: r.sms_notification_ready ?? null,
          sms_notification_status: r.sms_notification_status || null,
          ticket_created: r.ticket_created ?? null,
          agent_assignment_revision: r.agent_assignment_revision ?? null,
          transfer_state: r.transfer_state ?? null,
          agent_typing: r.agent_typing ?? false,
          agent_state: r.agent_state ?? null,
          state_updated_at: r.state_updated_at ?? null,
          state_revision: r.state_revision ?? null,
          current_agent_id: r.current_agent_id ?? null,
          typing_indicator_enabled: r.typing_indicator_enabled ?? null,
          typing_indicator_min_visible_ms: r.typing_indicator_min_visible_ms ?? null,
          typing_indicator_max_visible_ms: r.typing_indicator_max_visible_ms ?? null,
        });
      }

      // ==========================================================
      // getConversation — fetch canonical conversation state from Assist
      // ==========================================================
      case "getConversation": {
        const conversationId = body.conversation_id;
        if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });

        const localConvs = await base44.asServiceRole.entities.SupportConversation
          .filter({ conversation_id: conversationId }).catch(() => []);
        const local = localConvs?.[0];
        if (local && !auth.is_platform_authority && local.user_id !== auth.actor_user_id && local.tenant_id !== auth.tenant_id) {
          return Response.json({ error: "Not permitted", error_code: "TENANT_MISMATCH" }, { status: 403 });
        }

        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const assistConv = await getAssistConversation(secrets, conversationId, assistAuth);
        if (!assistConv.available) return unavailable(assistConv.reason || "UNREACHABLE");

        return Response.json({
          status: "ok",
          conversation: {
            conversation_id: assistConv.conversation_id,
            status: assistConv.status,
            support_agent_id: assistConv.support_agent_id,
            agent_name: assistConv.agent_name,
            agent_title: assistConv.agent_title,
            agent_avatar_initial: assistConv.agent_avatar_initial,
            ticket_id: local?.ticket_id || assistConv.ticket_id || null,
            ticket_number: local?.assist_ticket_number || assistConv.ticket_number || null,
          },
          messages: assistConv.messages || [],
        });
      }

      // ==========================================================
      // getSupportContext — full context restore (refresh/navigation)
      // ==========================================================
      case "getSupportContext": {
        const conversationId = body.conversation_id;
        if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });
        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const ctx = await getAssistSupportContext(secrets, conversationId, assistAuth);
        if (!ctx.available) return unavailable(ctx.reason || "UNREACHABLE");

        return Response.json({
          status: "ok",
          conversation: ctx.conversation,
          agent: ctx.agent,
          ticket: ctx.ticket,
          incident: ctx.incident,
          messages: ctx.messages || [],
        });
      }

      // ==========================================================
      // createTicket — delegate to Arriv Assist (AST-#### canonical)
      // ==========================================================
      case "createTicket": {
        const conversationId = body.conversation_id;
        if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });

        const localConvs = await base44.asServiceRole.entities.SupportConversation
          .filter({ conversation_id: conversationId }).catch(() => []);
        const local = localConvs?.[0];
        if (local && !auth.is_platform_authority && local.tenant_id !== auth.tenant_id) {
          return Response.json({ error: "Not permitted", error_code: "TENANT_MISMATCH" }, { status: 403 });
        }

        if (!assistReady) return unavailable("NOT_CONFIGURED");

        if (local?.ticket_id) {
          return Response.json({ status: "ok", ticket_number: local.assist_ticket_number || "", ticket_id: local.ticket_id, already_existed: true });
        }

        const r = await createAssistTicket(secrets, conversationId, body.severity || "L3", body.summary || "Support escalation", assistAuth);
        if (!r.available) return unavailable(r.reason || "UNREACHABLE");

        if (local) {
          await base44.asServiceRole.entities.SupportConversation.update(local.id, {
            ticket_id: r.ticket_id,
            assist_ticket_number: r.ticket_number,
            status: "escalated",
          }).catch(() => {});
        }

        return Response.json({ status: "ok", ticket_number: r.ticket_number, ticket_id: r.ticket_id });
      }

      // ==========================================================
      // getTicket — retrieve ticket from Assist
      // ==========================================================
      case "getTicket": {
        const ticketId = body.ticket_id;
        if (!ticketId) return Response.json({ error: "ticket_id required" }, { status: 400 });
        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const r = await getAssistTicket(secrets, ticketId, assistAuth);
        if (!r.available) return unavailable(r.reason || "UNREACHABLE");
        return Response.json({ status: "ok", ticket: r.ticket });
      }

      // ==========================================================
      // getAgentRegistry — fetch canonical agent roster from Assist
      // ==========================================================
      case "getAgentRegistry": {
        if (!assistReady) return unavailable("NOT_CONFIGURED");
        const r = await listAssistAgents(secrets, assistAuth);
        if (!r.available) return unavailable(r.reason || "UNREACHABLE");
        return Response.json({ status: "ok", agents: r.agents });
      }

      // ==========================================================
      // getCapabilities — fetch central Assist capability contract
      // ==========================================================
      case "getCapabilities": {
        if (!assistReady) return unavailable("NOT_CONFIGURED");
        const r = await getAssistCapabilities(secrets, assistAuth);
        if (!r.available) return unavailable(r.reason || "UNREACHABLE");
        return Response.json({ status: "ok", capabilities: r.capabilities });
      }

      // ==========================================================
      // checkConversationStatus — full canonical state poll.
      // Returns current agent, assignment revision, transfer state,
      // typing state, full message history, and typing config.
      // ==========================================================
      case "checkConversationStatus": {
        const conversationId = body.conversation_id;
        if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });
        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const assistConv = await getAssistConversation(secrets, conversationId, assistAuth);
        if (!assistConv.available) {
          if (assistConv.reason === "UNAUTHORIZED" || assistConv.reason === "CONVERSATION_NOT_FOUND") {
            const localConvs = await base44.asServiceRole.entities.SupportConversation
              .filter({ conversation_id: conversationId }).catch(() => []);
            const local = localConvs?.[0];
            if (local) {
              await base44.asServiceRole.entities.SupportConversation.update(local.id, {
                status: "closed",
              }).catch(() => {});
            }
            return Response.json({ status: "ok", closed: true, closure_reason: "NOT_FOUND" });
          }
          return unavailable(assistConv.reason || "UNREACHABLE");
        }

        const convStatus = (assistConv.status || "").toUpperCase();
        const localConvs = await base44.asServiceRole.entities.SupportConversation
          .filter({ conversation_id: conversationId }).catch(() => []);
        const local = localConvs?.[0];

        if (convStatus === "CLOSED") {
          if (local) {
            await base44.asServiceRole.entities.SupportConversation.update(local.id, {
              status: "closed",
            }).catch(() => {});
          }
        } else if (local && assistConv.support_agent_id) {
          await base44.asServiceRole.entities.SupportConversation.update(local.id, {
            support_agent_id: assistConv.support_agent_id,
            agent_name: assistConv.agent_name || local.agent_name || "",
            agent_title: assistConv.agent_title || local.agent_title || "",
            agent_avatar_initial: assistConv.agent_avatar_initial || local.agent_avatar_initial || "",
            agent_avatar_url: assistConv.agent_avatar_url || local.agent_avatar_url || "",
          }).catch(() => {});
        }

        return Response.json({
          status: "ok",
          conversation_status: assistConv.status || "",
          closed: convStatus === "CLOSED",
          closure_reason: assistConv.closure_reason || null,
          transcript_url: assistConv.transcript_url || null,
          transcript_offered: assistConv.transcript_offered ?? false,
          transcript_requested: assistConv.transcript_requested ?? false,
          transcript_ready: assistConv.transcript_ready ?? false,
          transcript_status: assistConv.transcript_status || null,
          support_agent_id: assistConv.support_agent_id || "",
          agent_name: assistConv.agent_name || "",
          agent_title: assistConv.agent_title || "",
          agent_avatar_initial: assistConv.agent_avatar_initial || "",
          agent_avatar_url: assistConv.agent_avatar_url || "",
          agent_assignment_revision: assistConv.agent_assignment_revision ?? null,
          transfer_state: assistConv.transfer_state ?? null,
          agent_typing: assistConv.agent_typing ?? false,
          agent_state: assistConv.agent_state ?? null,
          state_updated_at: assistConv.state_updated_at ?? null,
          state_revision: assistConv.state_revision ?? null,
          current_agent_id: assistConv.current_agent_id ?? null,
          typing_indicator_enabled: assistConv.typing_indicator_enabled ?? null,
          typing_indicator_min_visible_ms: assistConv.typing_indicator_min_visible_ms ?? null,
          typing_indicator_max_visible_ms: assistConv.typing_indicator_max_visible_ms ?? null,
          customer_first_name: assistConv.customer_first_name || null,
          customer_last_name: assistConv.customer_last_name || null,
          customer_full_name: assistConv.customer_full_name || null,
          customer_preferred_name: assistConv.customer_preferred_name || null,
          customer_name_complete: assistConv.customer_name_complete ?? null,
          name_formality_preference: assistConv.name_formality_preference || null,
          customer_issue_summary: assistConv.customer_issue_summary || null,
          customer_phone: assistConv.customer_phone || null,
          customer_phone_normalized: assistConv.customer_phone_normalized || null,
          customer_phone_verified: assistConv.customer_phone_verified ?? null,
          customer_phone_source: assistConv.customer_phone_source || null,
          sms_notification_requested: assistConv.sms_notification_requested ?? null,
          sms_notification_ready: assistConv.sms_notification_ready ?? null,
          sms_notification_status: assistConv.sms_notification_status || null,
          ticket_created: assistConv.ticket_created ?? null,
          messages: assistConv.messages || [],
        });
      }

      // ==========================================================
      // closeConversation — customer-initiated canonical closure.
      // Arriv Assist is the SOLE lifecycle authority. Multi-step
      // convergence: assistCloseConversation → getAssistConversation
      // (verify) → sendAssistMessage (fallback) → final verify.
      // Only mark local closed when canonical CLOSED is confirmed.
      // ==========================================================
      case "closeConversation": {
        const conversationId = body.conversation_id;
        if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });
        const localConvs = await base44.asServiceRole.entities.SupportConversation
          .filter({ conversation_id: conversationId }).catch(() => []);
        const local = localConvs?.[0];
        if (!local) return Response.json({ error: "Conversation not found" }, { status: 404 });
        if (!auth.is_platform_authority && local.user_id !== auth.actor_user_id) {
          return Response.json({ error: "Not permitted" }, { status: 403 });
        }
        if (local.status === "closed") {
          return Response.json({ status: "ok", closed: true, closure_reason: "CUSTOMER_ENDED", conversation_id: conversationId });
        }
        if (!assistReady) return unavailable("NOT_CONFIGURED");

        const closeRes = await closeAssistConversation(secrets, conversationId, assistAuth);
        let canonicalClosed = false;
        let closureReason = "CUSTOMER_ENDED";
        let transcriptUrl: string | null = null;

        if (closeRes.available) {
          const closeStatus = (closeRes.status || "").toUpperCase();
          if (closeStatus === "CLOSED" || closeStatus === "") {
            canonicalClosed = true;
            closureReason = closeRes.closure_reason || "CUSTOMER_ENDED";
            transcriptUrl = closeRes.transcript_url || null;
          }
        }

        if (!canonicalClosed) {
          const verifyConv = await getAssistConversation(secrets, conversationId, assistAuth);
          if (verifyConv.available) {
            const verifyStatus = (verifyConv.status || "").toUpperCase();
            if (verifyStatus === "CLOSED") {
              canonicalClosed = true;
              closureReason = verifyConv.closure_reason || "CUSTOMER_ENDED";
              transcriptUrl = verifyConv.transcript_url || null;
            }
          } else if (!closeRes.available) {
            return unavailable(closeRes.reason || verifyConv.reason || "UNREACHABLE");
          }
        }

        if (!canonicalClosed) {
          const msgRes = await sendAssistMessage(secrets, {
            conversation_id: conversationId,
            role: "user",
            content: "[Customer ended the chat]",
            repair_state: "none",
            metadata: { closure_intent: "CUSTOMER_ENDED" },
            page_context: body.page_context || null,
          }, assistAuth);

          if (msgRes.available) {
            const msgStatus = (msgRes.conversation_status || "").toUpperCase();
            if (msgStatus === "CLOSED") {
              canonicalClosed = true;
              closureReason = msgRes.closure_reason || "CUSTOMER_ENDED";
              transcriptUrl = msgRes.transcript_url || null;
            }
          }

          if (!canonicalClosed) {
            const finalVerify = await getAssistConversation(secrets, conversationId, assistAuth);
            if (finalVerify.available) {
              const finalStatus = (finalVerify.status || "").toUpperCase();
              if (finalStatus === "CLOSED") {
                canonicalClosed = true;
                closureReason = finalVerify.closure_reason || "CUSTOMER_ENDED";
                transcriptUrl = finalVerify.transcript_url || null;
              }
            }
          }
        }

        if (canonicalClosed) {
          await base44.asServiceRole.entities.SupportConversation.update(local.id, {
            status: "closed",
            last_message_at: new Date().toISOString(),
            last_message_preview: "Conversation ended by customer",
          }).catch(() => {});

          return Response.json({
            status: "ok",
            closed: true,
            closure_reason: closureReason,
            conversation_id: conversationId,
            transcript_url: transcriptUrl,
            transcript_offered: closeRes.transcript_offered ?? false,
            transcript_requested: closeRes.transcript_requested ?? false,
            transcript_ready: closeRes.transcript_ready ?? false,
            transcript_status: closeRes.transcript_status || null,
            customer_first_name: closeRes.customer_first_name || null,
            customer_last_name: closeRes.customer_last_name || null,
            customer_full_name: closeRes.customer_full_name || null,
            customer_preferred_name: closeRes.customer_preferred_name || null,
            customer_name_complete: closeRes.customer_name_complete ?? null,
            name_formality_preference: closeRes.name_formality_preference || null,
            customer_issue_summary: closeRes.customer_issue_summary || null,
            customer_phone: closeRes.customer_phone || null,
            customer_phone_normalized: closeRes.customer_phone_normalized || null,
            customer_phone_verified: closeRes.customer_phone_verified ?? null,
            customer_phone_source: closeRes.customer_phone_source || null,
            sms_notification_requested: closeRes.sms_notification_requested ?? null,
            sms_notification_ready: closeRes.sms_notification_ready ?? null,
            sms_notification_status: closeRes.sms_notification_status || null,
            ticket_created: closeRes.ticket_created ?? null,
          });
        }

        return unavailable("CLOSE_NOT_CONFIRMED");
      }

      // ==========================================================
      // listConversations — admin console (local references only)
      // ==========================================================
      case "listConversations": {
        if (!auth.is_platform_authority && auth.actor_role !== "tenant_admin") {
          return Response.json({ error: "Admin access required" }, { status: 403 });
        }
        const q: any = auth.is_platform_authority ? {} : { tenant_id: auth.tenant_id };
        const conversations = await base44.asServiceRole.entities.SupportConversation
          .filter(q, "-last_message_at", 50).catch(() => []);
        return Response.json({ status: "ok", conversations: conversations || [] });
      }

      // ==========================================================
      // diagnoseTransport — admin diagnostic (identity + reachability)
      // ============================================================
      case "diagnoseTransport": {
        if (!auth.is_platform_authority) {
          return Response.json({ error: "Platform admin required" }, { status: 403 });
        }
        const health = await fetchAssistHealth(secrets);
        const fakeId = "diag-test-nonexistent-0000";
        const results: any = {};

        results.assistHealth = { available: health.available, reason: health.reason };

        const agents = await listAssistAgents(secrets, assistAuth);
        results.assistGetAgentRegistry = { authOk: agents.available, reason: agents.reason, agentCount: agents.agents?.length ?? 0 };

        const caps = await getAssistCapabilities(secrets, assistAuth);
        results.assistGetSupportCapabilities = { authOk: caps.available, reason: caps.reason, capCount: caps.capabilities?.length ?? 0 };

        const conv = await getAssistConversation(secrets, fakeId, assistAuth);
        results.assistGetConversation = { authOk: conv.available, reason: conv.reason };

        const ctx = await getAssistSupportContext(secrets, fakeId, assistAuth);
        results.assistGetSupportContext = { authOk: ctx.available, reason: ctx.reason };

        const ticket = await getAssistTicket(secrets, fakeId, assistAuth);
        results.assistGetTicket = { authOk: ticket.available, reason: ticket.reason };

        const startConv = await startAssistConversation(secrets, {
          role: "user", content: "diagnostic transport certification probe", repair_state: "none",
        }, assistAuth);
        results.assistStartConversation = {
          authOk: startConv.available,
          reason: startConv.reason,
          conversationCreated: !!startConv.conversation_id,
          agentAssigned: !!startConv.support_agent_id,
          assignmentStatus: startConv.assignment_status,
        };

        const msg = await sendAssistMessage(secrets, {
          conversation_id: fakeId, role: "user", content: "diagnostic probe", repair_state: "none",
        }, assistAuth);
        results.assistSendMessage = { authOk: msg.available, reason: msg.reason };

        const newTicket = await createAssistTicket(secrets, fakeId, "L3", "diagnostic probe", assistAuth);
        results.assistCreateTicket = { authOk: newTicket.available, reason: newTicket.reason };

        const allReasons = Object.values(results).map((r: any) => r.reason).filter(Boolean);
        const invalidSignature = allReasons.some((r: any) => String(r).includes("INVALID_SIGNATURE") || String(r) === "UNAUTHORIZED");

        return Response.json({
          status: "ok",
          configured: assistReady,
          reachable: health.available,
          identity: health.available ? {
            app_id: health.app_id,
            product_key: health.product_key,
            contract_version: health.contract_version,
            backend_functions_live: health.backend_functions_live,
          } : null,
          reason: health.available ? null : health.reason,
          canonicalFunctionResults: results,
          invalidSignatureDetected: invalidSignature,
        });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}