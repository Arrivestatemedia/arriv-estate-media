// recruitingSearchProvider.ts
// Pure research abstraction — no tenant logic.
// Uses gemini_3_flash with add_context_from_internet for real web search.

const RESEARCH_TIMEOUT_MS = 55000;

/**
 * Returns a 0-5 seniority level for a given job title.
 * 0 = intern/entry, 5 = C-suite/owner
 */
export function getSeniority(title) {
  if (!title) return 0;
  const t = title.toLowerCase().trim();

  // C-suite / owner
  if (/\b(ceo|cto|cfo|coo|cmo|cio|chief|founder|co-founder|owner|partner|president)\b/.test(t)) return 5;
  // VP / SVP / EVP
  if (/\b(vp|svp|evp|vice president|head of|director of)\b/.test(t)) return 4;
  // Director
  if (/\bdirector\b/.test(t)) return 3;
  // Manager / lead / principal
  if (/\b(manager|lead|principal|supervisor|senior manager)\b/.test(t)) return 2;
  // Senior IC
  if (/\b(senior|sr\.?)\b/.test(t)) return 1;
  // IC / entry
  return 0;
}

/**
 * Rejects prospects whose seniority is far above the job's seniority.
 * E.g. a CEO should not be returned for an IC Sales Growth Advisor role.
 */
export function isSeniorityMismatch(jobTitle, prospectTitle) {
  if (!jobTitle || !prospectTitle) return false;
  const jobLevel = getSeniority(jobTitle);
  const prospectLevel = getSeniority(prospectTitle);

  // If the job is IC (0-1) and the prospect is VP+ (4-5), it's a mismatch.
  if (jobLevel <= 1 && prospectLevel >= 4) return true;
  // If the job is senior management (3-4) and the prospect is entry (0), it's a mismatch.
  if (jobLevel >= 3 && prospectLevel <= 0) return true;
  return false;
}

/**
 * Builds the LLM prompt for talent research with ethical/source-citation rules.
 */
export function buildResearchPrompt({ job, strategy, queries, extraInstructions }) {
  const jobTitle = job?.title || "Sales Growth Advisor";
  const jobSkills = (job?.skills || []).join(", ");
  const jobDescription = job?.description || "";
  const jobQualifications = (job?.required_qualifications || []).join("; ");

  const queryBlock = (queries && queries.length)
    ? queries.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "";

  return `You are a professional talent sourcing assistant for ${"Arriv Estate Media"}.

GOAL: Find real, verifiable people who match the target role below. You must use web search to find actual public profiles — do NOT invent or hallucinate people.

TARGET ROLE:
- Title: ${jobTitle}
- Key skills: ${jobSkills || "not specified"}
- Qualifications: ${jobQualifications || "not specified"}
${jobDescription ? `- Description: ${jobDescription.slice(0, 800)}` : ""}

SEARCH QUERIES:
${queryBlock || "Use your judgment to construct searches based on the target role."}

${extraInstructions || ""}

ETHICAL RULES:
1. Only return people whose information is publicly available (LinkedIn, company sites, professional directories, conference speaker lists, etc.).
2. For every person, include the source_url and at least one source record proving their existence.
3. Do NOT fabricate names, titles, companies, or URLs. If you cannot find enough real people, return fewer — quality over quantity.
4. Accept similar or related job titles at the same seniority level — do not require an exact title match.
5. Prioritize people whose current or recent role is close to the target title and seniority.
6. Never include private contact information (personal phone, personal email) unless it is published publicly on a professional page.

Return a JSON array of people. Each person object must have:
- full_name (string)
- current_title (string)
- current_company (string)
- public_location (string, city/state if available)
- skills (array of strings)
- linkedin_url (string, if found)
- source_url (string — the primary public source)
- source_records (array of { url, title, snippet } — every public source used)
- seniority_level (integer 0-5)

Return ONLY a JSON object with a "prospects" array. No commentary.`;
}

/**
 * Minimal JSON schema for the LLM response — prioritizes web-search time over response depth.
 */
export const PROSPECT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prospects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          full_name: { type: "string" },
          current_title: { type: "string" },
          current_company: { type: "string" },
          public_location: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          linkedin_url: { type: "string" },
          source_url: { type: "string" },
          source_records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                snippet: { type: "string" }
              }
            }
          },
          seniority_level: { type: "integer" }
        },
        required: ["full_name", "current_title"]
      }
    }
  },
  required: ["prospects"]
};

/**
 * Calls InvokeLLM with web search enabled (gemini_3_flash).
 * Wrapped in a 55-second timeout to keep the chat responsive.
 */
export async function runTalentResearch(base44, opts) {
  const { job, strategy, queries, extraInstructions } = opts;

  const prompt = buildResearchPrompt({ job, strategy, queries, extraInstructions });

  const llmPromise = base44.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: PROSPECT_RESPONSE_SCHEMA,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Research timed out after 55 seconds")), RESEARCH_TIMEOUT_MS)
  );

  const result = await Promise.race([llmPromise, timeoutPromise]);

  // InvokeLLM with response_json_schema returns a dict
  const prospects = result?.prospects || result?.output?.prospects || [];
  return Array.isArray(prospects) ? prospects : [];
}