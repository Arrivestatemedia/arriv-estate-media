/**
 * recruitingSearchProvider.ts
 * Pure talent-research abstraction — no tenant logic.
 * Provides seniority scoring, seniority-mismatch filtering, prompt building,
 * a minimal JSON response schema, and a timeout-wrapped LLM research call.
 */

// ─── Seniority ───────────────────────────────────────────────────────────────

export function getSeniority(title: string): number {
  if (!title) return 2;
  const t = title.toLowerCase().trim();

  // Level 5 — C-suite / founders / owners
  if (/\b(cfo|ceo|coo|cto|cio|chief|founder|co-founder|owner|partner|president|principal)\b/.test(t)) return 5;

  // Level 4 — VP / Head / Director
  if (/\b(svp|evp|vp|vice president|head of|director|dir\.?)\b/.test(t)) return 4;

  // Level 3 — Senior / Lead / Manager / Principal / Staff
  if (/\b(senior|sr\.?|lead|principal|staff|manager|mgr\.?)\b/.test(t)) return 3;

  // Level 1 — Junior / Intern / Assistant / Trainee
  if (/\b(junior|jr\.?|intern|assistant|trainee|entry.level)\b/.test(t)) return 1;

  // Level 2 — Individual contributors (specialist, analyst, coordinator, associate, advisor, consultant, agent, rep)
  return 2;
}

export function isSeniorityMismatch(jobTitle: string, prospectTitle: string): boolean {
  const jobLevel = getSeniority(jobTitle);
  const prospectLevel = getSeniority(prospectTitle);
  // Reject if prospect is 2+ levels above the job (e.g. CEO for an IC role)
  return prospectLevel - jobLevel >= 2;
}

// ─── Response schema (minimal — prioritizes web-search time over depth) ──────

export const prospectResponseSchema = {
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
          source_snippet: { type: "string" }
        }
      }
    }
  }
};

// ─── Prompt builder ──────────────────────────────────────────────────────────

export function buildResearchPrompt(opts: {
  job?: any;
  strategy?: string;
  queries?: string[];
  extraInstructions?: string;
  locationConstraint?: string;
  seniorityInstructions?: string;
}): string {
  const { job, strategy, queries, extraInstructions, locationConstraint, seniorityInstructions } = opts;

  const jobTitle = job?.title || "Sales Growth Advisor";
  const jobSkills = job?.skills?.length ? job.skills.join(", ") : "";
  const jobDescription = job?.description || "";
  const responsibilities = job?.responsibilities?.length ? job.responsibilities.join("; ") : "";

  return `You are an expert talent researcher for Arriv Estate Media, a real estate media company.

TASK: Find REAL, VERIFIABLE people who would be good candidates for the following role at our company.

ROLE: ${jobTitle}
${jobSkills ? `KEY SKILLS: ${jobSkills}` : ""}
${jobDescription ? `ROLE DESCRIPTION: ${jobDescription}` : ""}
${responsibilities ? `KEY RESPONSIBILITIES: ${responsibilities}` : ""}

${locationConstraint ? `LOCATION CONSTRAINT: ${locationConstraint}` : ""}

${seniorityInstructions || ""}

${queries && queries.length ? `SEARCH QUERIES TO GUIDE YOUR RESEARCH:\n${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : ""}

${extraInstructions ? `ADDITIONAL INSTRUCTIONS:\n${extraInstructions}` : ""}

CRITICAL RULES — FOLLOW ALL OF THESE:
1. Only return REAL, VERIFIABLE people found on the public web. Do NOT fabricate, hallucinate, or invent anyone.
2. For every person, include the source_url where you found their information.
3. Include their LinkedIn profile URL if publicly available. If not found, use an empty string.
4. Include their current job title and current company.
5. Include their public location in "City, State" format.
6. List relevant skills visible in their public profile.
7. If you cannot find enough real people, return fewer — NEVER invent people to fill the list.
8. Accept SIMILAR or RELATED job titles at the same seniority level. Do not require exact title matches. For example, "Real Estate Agent", "Realtor", "Real Estate Professional", and "Property Consultant" are all valid matches for a real estate sales role.
9. Respect privacy: only use publicly available professional information. Do not include private contact details unless they are publicly listed on a professional profile.
10. For each person, include a brief source_snippet — a short quote or summary from the source that confirms this person exists and matches the criteria.

Return a JSON object with a "prospects" array. Each prospect must have:
- full_name: string (their real full name)
- current_title: string (their current job title)
- current_company: string (their current employer or "Independent" if self-employed)
- public_location: string (City, State)
- skills: array of strings (relevant skills from their profile)
- linkedin_url: string (LinkedIn profile URL or empty string)
- source_url: string (the URL where you found this person)
- source_snippet: string (brief evidence from the source)`;
}

// ─── Research runner (55s timeout) ───────────────────────────────────────────

export async function runTalentResearch(base44: any, opts: {
  job?: any;
  strategy?: string;
  queries?: string[];
  extraInstructions?: string;
  locationConstraint?: string;
  seniorityInstructions?: string;
}): Promise<{ prospects: any[] }> {
  const prompt = buildResearchPrompt(opts);

  const researchPromise = base44.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: prospectResponseSchema,
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Research timed out after 55 seconds")), 55_000)
  );

  const result = await Promise.race([researchPromise, timeoutPromise]);

  // InvokeLLM with response_json_schema returns a dict
  if (result && Array.isArray(result.prospects)) {
    return { prospects: result.prospects };
  }
  // Fallback: if the result is a string, try to parse it
  if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      return { prospects: parsed.prospects || [] };
    } catch {
      return { prospects: [] };
    }
  }
  return { prospects: result?.prospects || [] };
}