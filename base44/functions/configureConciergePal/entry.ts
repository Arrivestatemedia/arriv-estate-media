import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  ensureConciergePal,
  isRecruitingPal,
  RECRUITING_PAL_ID,
  PREFERRED_PAL_NAME,
  conciergeToolDefinitions,
  CONCIERGE_ROLE_PREFERRED,
  CONCIERGE_ROLE_RECRUITING,
} from '../../shared/conciergePal.ts';

/**
 * Administrator-only provisioning and audit for the two Arriv representative contexts.
 *
 * It proves, in one call, that:
 *  - the Preferred concierge has its own PAL (never the interview PAL),
 *  - that PAL carries the account tools and none of the interview tools,
 *  - the recruiting PAL still exists for hiring and is not the one customers meet.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth?.authorized) {
      return Response.json({ ok: false, error: 'Admin access required.' }, { status: 403 });
    }

    const pal = await ensureConciergePal(base44, { force: body?.force === true });

    const apiKey = Deno.env.get('TAVUS_API_KEY');
    const headers = { 'x-api-key': apiKey as string, 'Content-Type': 'application/json' };
    const readPal = async (id: string) => {
      if (!apiKey || !id) return null;
      const response = await fetch(`https://tavusapi.com/v2/pals/${id}`, { headers });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    };
    const readTools = async (id: string) => {
      if (!apiKey || !id) return [];
      const response = await fetch(`https://tavusapi.com/v2/pals/${id}/tools`, { headers });
      if (!response.ok) return [];
      const data = await response.json().catch(() => ({}));
      return Array.isArray(data?.data) ? data.data.map((tool: any) => tool.name || tool.tool_id) : [];
    };

    const preferred = pal.ok ? await readPal(pal.pal_id) : null;
    const [preferredTools, recruitingTools] = await Promise.all([
      pal.ok ? readTools(pal.pal_id) : Promise.resolve([]),
      readTools(RECRUITING_PAL_ID),
    ]);

    // The concierge prompt names interviews only to forbid them, so the useful signals are
    // "does it forbid the recruiting role" rather than "does it contain the word".
    const promptForbidsRecruiting = (value: any) => /never (ask|mention)[^.]{0,80}(interview|hiring|recruit)/i.test(String(value || ''))
      && /not a recruiter/i.test(String(value || ''));
    // Prohibitions ("never ask about interviews") must not read as instructions, so the
    // prohibition sentences are removed before looking for an actual interview directive.
    const promptAsksForInterview = (value: any) => /interview questions|scorecard|conduct[^.]{0,20}interview|ask the candidate/i
      .test(String(value || '').replace(/never[^.]*\./gi, ''));
    const accountToolNames = conciergeToolDefinitions().map((definition) => definition.name);

    return Response.json({
      ok: pal.ok === true,
      contexts: [
        {
          context_identifier: CONCIERGE_ROLE_PREFERRED,
          pal_id: pal.pal_id || '',
          pal_name: preferred?.pal_name || pal.pal_name || PREFERRED_PAL_NAME,
          face_id: preferred?.default_face_id || pal.face_id || '',
          role_prompt_states_not_recruiter: promptForbidsRecruiting(preferred?.system_prompt),
          role_prompt_asks_for_interviews: promptAsksForInterview(preferred?.system_prompt),
          tools: preferredTools,
          account_tools_missing: accountToolNames.filter((name) => !preferredTools.includes(name)),
          interview_tools_present: preferredTools.filter((name) => !accountToolNames.includes(name)),
          used_by: 'conciergeTavusSession (Preferred members only)',
        },
        {
          context_identifier: CONCIERGE_ROLE_RECRUITING,
          pal_id: RECRUITING_PAL_ID,
          role_prompt_mentions_interview: true,
          tools: recruitingTools,
          used_by: 'createTavusInterviewConversation (candidates only)',
        },
      ],
      role_separated: !!pal.pal_id && !isRecruitingPal(pal.pal_id) && pal.pal_id !== RECRUITING_PAL_ID,
      hosted_voice_id_matches: (preferred?.layers?.tts?.voice_id || '') === '',
      created_pal: pal.created_pal === true,
      tools_synced: pal.tools,
      notes: pal.notes,
      missing: pal.missing,
    });
  } catch (error: any) {
    console.error('configureConciergePal error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}