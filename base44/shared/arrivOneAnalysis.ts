/**
 * Shared call-analysis engine for Arriv One.
 *
 * Two distinct inputs are supported and never conflated:
 *  - a transcript from a consented recording (source "recording")
 *  - the representative's own dictation or typed note (source "rep_dictation")
 *
 * The model is instructed to stay inside the supplied text: no invented
 * statements, no confirmed bookings, and speaker attribution flagged uncertain
 * unless the transcript actually carries labels.
 */

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    objections: { type: 'array', items: { type: 'string' } },
    services_discussed: { type: 'array', items: { type: 'string' } },
    package_interest: { type: 'string' },
    requested_info: { type: 'array', items: { type: 'string' } },
    follow_up_commitments: { type: 'array', items: { type: 'string' } },
    suggested_outcome: { type: 'string' },
    suggested_next_steps: { type: 'array', items: { type: 'string' } },
    suggested_lead_status: { type: 'string' },
    speaker_labels_reliable: { type: 'boolean' },
    coaching: {
      type: 'object',
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        missed_commitments: { type: 'array', items: { type: 'string' } },
        discovery_questions: { type: 'array', items: { type: 'string' } },
        approach_notes: { type: 'array', items: { type: 'string' } },
      },
    },
    uncertainty: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'suggested_outcome'],
};

export function analysisPrompt(options: any) {
  const { source, text, prospect, rep } = options;
  const provenance =
    source === 'recording'
      ? 'This text is a machine transcript of a recorded call. It may contain recognition errors.'
      : 'This text is what the representative themselves typed or dictated after the call. Treat it as their account, not a transcript.';
  return `You are the Arriv One call analyst for Arriv Estate Media, a real estate media company (photography, video, MLS publishing, property marketing).

${provenance}

Representative: ${rep || 'unknown'}
Prospect: ${prospect || 'unknown'}

Text:
"""${String(text || '').slice(0, 18000)}"""

Produce a structured analysis. Mandatory rules:
1. Only state things that appear in the text. Never invent a statement, a price, a date or a commitment.
2. Do not mark anything as booked or confirmed. Interest is interest, never a booking.
3. suggested_lead_status may only be NEW, CONNECTED or CONVERTED, and only when the text clearly supports it.
4. Coaching must be supportive and specific to what actually happened. If the text is too thin to coach, return empty arrays and say so in uncertainty.
5. speaker_labels_reliable is true only if the transcript itself distinguishes speakers.
6. Put anything uncertain or possibly mis-heard in uncertainty.
7. Do not present sentiment as fact. Describe behaviour you can see in the text.`;
}

export async function analyzeCallText(base44: any, options: any) {
  const raw: any = await base44.integrations.Core.InvokeLLM({
    prompt: analysisPrompt(options),
    response_json_schema: ANALYSIS_SCHEMA,
    model: 'gpt_5_mini',
  });
  const status = options.suggestedStatus || '';
  const allowed = ['NEW', 'CONNECTED', 'CONVERTED'];
  return {
    summary: raw?.summary || '',
    objections: raw?.objections || [],
    services_discussed: raw?.services_discussed || [],
    package_interest: raw?.package_interest || '',
    requested_info: raw?.requested_info || [],
    follow_up_commitments: raw?.follow_up_commitments || [],
    suggested_outcome: raw?.suggested_outcome || '',
    suggested_next_steps: raw?.suggested_next_steps || [],
    suggested_lead_status: allowed.includes(String(raw?.suggested_lead_status || '').toUpperCase())
      ? String(raw.suggested_lead_status).toUpperCase()
      : '',
    speaker_labels_reliable: raw?.speaker_labels_reliable === true,
    coaching: raw?.coaching || {},
    uncertainty: raw?.uncertainty || [],
    status,
  };
}

export function analysisSummaryLine(analysis: any) {
  if (!analysis?.summary) return 'No summary available yet.';
  const outcome = analysis?.suggested_outcome ? ` Outcome: ${analysis.suggested_outcome}.` : '';
  return `${analysis.summary}${outcome}`;
}