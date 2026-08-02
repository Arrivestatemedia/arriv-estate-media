import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import {
  getSeniority,
  isSeniorityMismatch,
  buildResearchPrompt,
  runTalentResearch,
} from "../../shared/recruitingSearchProvider.ts";

const COMPANY_NAME = "Arriv Estate Media";
const DEFAULT_SALES_TITLE = "Sales Growth Advisor";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function geocodeZip(zipCode: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&postalcode=${encodeURIComponent(zipCode)}&country=US`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "ArrivEstateMedia-Recruiting/1.0" },
    });
    const data = await resp.json();
    if (!data || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

/**
 * Lenient location filter — trusts the LLM.
 * Strict filtering drops valid candidates whose location string is formatted
 * differently than the geocoded city. We only reject if the prospect location
 * shares NO words with the geocoded area.
 */
function isLocationLocal(prospectLocation: string, geocoded: { displayName: string } | null): boolean {
  if (!prospectLocation || !geocoded) return true; // lenient: allow if we can't check
  const loc = prospectLocation.toLowerCase();
  const geo = geocoded.displayName.toLowerCase();
  // Extract meaningful words (length > 3) from the geocoded name
  const geoWords = geo.split(/[,\s]+/).filter((w) => w.length > 3 && !["united", "states", "america"].includes(w));
  if (geoWords.length === 0) return true;
  return geoWords.some((word) => loc.includes(word));
}

function personToProspect(person: any, jobId: string | null, searchId: string, zipCode: string, radiusMiles: number): any {
  return {
    name: person.full_name || "Unknown",
    title: person.current_title || "",
    company: person.current_company || "",
    location: person.public_location || "",
    skills: person.skills || [],
    linkedin_url: person.linkedin_url || "",
    source_url: person.source_url || "",
    source_records: [
      {
        url: person.source_url || "",
        snippet: person.source_snippet || "",
        found_at: new Date().toISOString(),
      },
    ],
    contact_records: [],
    job_id: jobId || null,
    search_id: searchId,
    status: "new",
    outreach_status: "not_started",
    do_not_contact: false,
    consent_status: "unknown",
    seniority_level: getSeniority(person.current_title || ""),
    zip_code: zipCode,
    radius_miles: radiusMiles,
  };
}

function isDuplicate(prospect: any, existingProspects: any[]): boolean {
  const name = (prospect.name || "").toLowerCase().trim();
  const company = (prospect.company || "").toLowerCase().trim();
  if (!name) return true;
  return existingProspects.some(
    (p) =>
      (p.name || "").toLowerCase().trim() === name &&
      (p.company || "").toLowerCase().trim() === company
  );
}

function buildQueriesFromStrategy(strategy: string, job: any, zipCode: string, radiusMiles: number): string[] {
  const jobTitle = job?.title || DEFAULT_SALES_TITLE;
  const skills = job?.skills || [];

  if (strategy === "skills_based") {
    const baseQueries = skills.length
      ? skills.map((s) => `"${jobTitle}" "${s}" ${zipCode}`)
      : [`"${jobTitle}" ${zipCode}`];
    return baseQueries;
  }
  if (strategy === "company_based") {
    return [
      `"${jobTitle}" real estate ${zipCode}`,
      `real estate professional ${zipCode} ${skills.slice(0, 2).join(" ")}`,
      `real estate agent realtor ${zipCode}`,
    ];
  }
  if (strategy === "location_based") {
    return [
      `"${jobTitle}" near ${zipCode} within ${radiusMiles} miles`,
      `real estate agent realtor ${zipCode}`,
      `real estate professional ${zipCode} area`,
    ];
  }
  // default
  return [`"${jobTitle}" ${zipCode} ${skills.slice(0, 3).join(" ")}`];
}

async function logActivity(base44: any, entry: any) {
  try {
    await base44.asServiceRole.entities.RecruitingActivity.create({
      type: entry.type,
      prospect_id: entry.prospect_id || null,
      prospect_name: entry.prospect_name || null,
      actor: entry.actor || "system",
      previous_value: entry.previous_value || null,
      new_value: entry.new_value || null,
      metadata: entry.metadata || {},
    });
  } catch (e) {
    console.warn("Failed to log activity:", e.message);
  }
}

async function getSettings(base44: any) {
  const rows = await base44.asServiceRole.entities.RecruitingSettings.list();
  if (rows && rows.length > 0) return rows[0];
  return await base44.asServiceRole.entities.RecruitingSettings.create({
    recruiting_enabled: true,
    max_search_results: 25,
    outreach_approval_required: true,
    opt_out_language:
      "If you'd prefer not to receive these messages, reply STOP at any time.",
    default_search_radius: 50,
    continuous_recruiting_enabled: false,
  });
}

// ─── Action: natural_language_search (core of the chat) ──────────────────────

async function handleNaturalLanguageSearch(base44: any, body: any, user: any) {
  const { query, zipCode, radiusMiles, jobId } = body;
  const radius = radiusMiles || 50;

  if (!zipCode) {
    return Response.json({ error: "Zip code is required" }, { status: 400 });
  }
  if (!query) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  // 1. Geocode the zip via Nominatim
  const geocoded = await geocodeZip(zipCode);
  if (!geocoded) {
    return Response.json({ error: `Could not geocode zip code ${zipCode}` }, { status: 400 });
  }

  // 2. Build location constraint string with the radius
  const locationConstraint = `Candidates must be located within approximately ${radius} miles of ${geocoded.displayName} (zip code ${zipCode}). Prefer candidates whose public location includes the city or state near this zip code.`;

  // 3. Get job if provided
  let job = null;
  if (jobId) {
    try {
      job = await base44.asServiceRole.entities.HireJob.get(jobId);
    } catch {
      job = null;
    }
  }

  // 4. Build seniority instructions
  const jobTitle = job?.title || DEFAULT_SALES_TITLE;
  const seniorityInstructions = `The target role is "${jobTitle}" (seniority level ${getSeniority(jobTitle)} on a 0-5 scale). Do NOT return people who are significantly more senior (e.g., CEOs, VPs, Directors) unless they would realistically consider an individual contributor role. Accept similar or related job titles at the same seniority level.`;

  // 5. Create search record
  const search = await base44.asServiceRole.entities.RecruitingSearch.create({
    strategy: "natural_language",
    queries: [query],
    status: "running",
    job_id: jobId || null,
    zip_code: zipCode,
    radius_miles: radius,
    natural_language_query: query,
  });

  try {
    // 6. Call runTalentResearch with seniority + location instructions
    const result = await runTalentResearch(base44, {
      job,
      strategy: "natural_language",
      queries: [query],
      locationConstraint,
      seniorityInstructions,
      extraInstructions: query,
    });

    const people = result?.prospects || [];

    // 7. Filter by seniority mismatch
    const seniorityFiltered: any[] = [];
    const afterSeniority: any[] = [];
    for (const person of people) {
      if (isSeniorityMismatch(jobTitle, person.current_title || "")) {
        seniorityFiltered.push(person);
      } else {
        afterSeniority.push(person);
      }
    }

    // 8. Filter by location (lenient — trusts the LLM)
    const locationFiltered: any[] = [];
    const afterLocation: any[] = [];
    for (const person of afterSeniority) {
      if (!isLocationLocal(person.public_location, geocoded)) {
        locationFiltered.push(person);
      } else {
        afterLocation.push(person);
      }
    }

    // 9. Dedup against existing prospects
    const existingProspects = await base44.asServiceRole.entities.RecruitingProspect.filter(
      { job_id: jobId || { $in: [null, ""] } },
      "-created_date",
      500
    );

    const freshProspects: any[] = [];
    for (const person of afterLocation) {
      const prospect = personToProspect(person, jobId || null, search.id, zipCode, radius);
      if (!isDuplicate(prospect, existingProspects) && !isDuplicate(prospect, freshProspects)) {
        freshProspects.push(prospect);
      }
    }

    // 10. Create prospect records
    if (freshProspects.length > 0) {
      await base44.asServiceRole.entities.RecruitingProspect.bulkCreate(freshProspects);
    }

    // 11. Update search record
    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "completed",
      results_count: freshProspects.length,
      seniority_filtered: seniorityFiltered.length,
      location_filtered: locationFiltered.length,
    });

    // 12. Log activity
    await logActivity(base44, {
      type: "natural_language_search",
      actor: user?.full_name || user?.email || "admin",
      metadata: {
        search_id: search.id,
        query,
        zip_code: zipCode,
        radius_miles: radius,
        results: freshProspects.length,
        seniority_filtered: seniorityFiltered.length,
        location_filtered: locationFiltered.length,
      },
    });

    return Response.json({
      success: true,
      fresh_prospects: freshProspects,
      seniority_filtered: seniorityFiltered.length,
      location_filtered: locationFiltered.length,
      search_id: search.id,
    });
  } catch (error) {
    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "failed",
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: run_search ──────────────────────────────────────────────────────

async function handleRunSearch(base44: any, body: any, user: any) {
  const { strategy, jobId, zipCode, radiusMiles, queries } = body;
  const radius = radiusMiles || 50;
  const strat = strategy || "skills_based";

  if (!zipCode) {
    return Response.json({ error: "Zip code is required" }, { status: 400 });
  }

  const geocoded = await geocodeZip(zipCode);
  if (!geocoded) {
    return Response.json({ error: `Could not geocode zip code ${zipCode}` }, { status: 400 });
  }

  let job = null;
  if (jobId) {
    try {
      job = await base44.asServiceRole.entities.HireJob.get(jobId);
    } catch {
      job = null;
    }
  }

  const jobTitle = job?.title || DEFAULT_SALES_TITLE;
  const locationConstraint = `Candidates must be located within approximately ${radius} miles of ${geocoded.displayName} (zip code ${zipCode}).`;
  const seniorityInstructions = `The target role is "${jobTitle}" (seniority level ${getSeniority(jobTitle)}). Do not return people significantly more senior than this level.`;
  const builtQueries = queries && queries.length ? queries : buildQueriesFromStrategy(strat, job, zipCode, radius);

  const search = await base44.asServiceRole.entities.RecruitingSearch.create({
    strategy: strat,
    queries: builtQueries,
    status: "running",
    job_id: jobId || null,
    zip_code: zipCode,
    radius_miles: radius,
  });

  try {
    const result = await runTalentResearch(base44, {
      job,
      strategy: strat,
      queries: builtQueries,
      locationConstraint,
      seniorityInstructions,
    });

    const people = result?.prospects || [];

    const seniorityFiltered: any[] = [];
    const afterSeniority: any[] = [];
    for (const person of people) {
      if (isSeniorityMismatch(jobTitle, person.current_title || "")) {
        seniorityFiltered.push(person);
      } else {
        afterSeniority.push(person);
      }
    }

    const locationFiltered: any[] = [];
    const afterLocation: any[] = [];
    for (const person of afterSeniority) {
      if (!isLocationLocal(person.public_location, geocoded)) {
        locationFiltered.push(person);
      } else {
        afterLocation.push(person);
      }
    }

    const existingProspects = await base44.asServiceRole.entities.RecruitingProspect.filter(
      { job_id: jobId || { $in: [null, ""] } },
      "-created_date",
      500
    );

    const freshProspects: any[] = [];
    for (const person of afterLocation) {
      const prospect = personToProspect(person, jobId || null, search.id, zipCode, radius);
      if (!isDuplicate(prospect, existingProspects) && !isDuplicate(prospect, freshProspects)) {
        freshProspects.push(prospect);
      }
    }

    if (freshProspects.length > 0) {
      await base44.asServiceRole.entities.RecruitingProspect.bulkCreate(freshProspects);
    }

    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "completed",
      results_count: freshProspects.length,
      seniority_filtered: seniorityFiltered.length,
      location_filtered: locationFiltered.length,
    });

    await logActivity(base44, {
      type: "run_search",
      actor: user?.full_name || user?.email || "admin",
      metadata: { search_id: search.id, strategy: strat, results: freshProspects.length },
    });

    return Response.json({
      success: true,
      fresh_prospects: freshProspects,
      seniority_filtered: seniorityFiltered.length,
      location_filtered: locationFiltered.length,
      search_id: search.id,
    });
  } catch (error) {
    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "failed",
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: list_prospects ──────────────────────────────────────────────────

async function handleListProspects(base44: any, body: any) {
  const { status, jobId, pipelineId, limit, offset } = body;
  const query: any = {};
  if (status) query.status = status;
  if (jobId) query.job_id = jobId;
  if (pipelineId) query.pipeline_id = pipelineId;

  const prospects = await base44.asServiceRole.entities.RecruitingProspect.filter(
    query,
    "-created_date",
    limit || 100,
    offset || 0
  );
  return Response.json({ success: true, prospects });
}

// ─── Action: save / dismiss / approve ────────────────────────────────────────

async function handleSaveProspect(base44: any, body: any, user: any) {
  const { prospectId, pipelineId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const update: any = { status: "saved" };
  if (pipelineId) update.pipeline_id = pipelineId;

  const updated = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, update);

  if (pipelineId) {
    const pipeline = await base44.asServiceRole.entities.TalentPipeline.get(pipelineId);
    if (pipeline) {
      await base44.asServiceRole.entities.TalentPipeline.update(pipelineId, {
        prospect_count: (pipeline.prospect_count || 0) + 1,
      });
    }
  }

  await logActivity(base44, {
    type: "save_prospect",
    prospect_id: prospectId,
    prospect_name: prospect.name,
    actor: user?.full_name || user?.email || "admin",
    previous_value: prospect.status,
    new_value: "saved",
  });

  return Response.json({ success: true, prospect: updated });
}

async function handleDismissProspect(base44: any, body: any, user: any) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const updated = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    status: "dismissed",
  });

  await logActivity(base44, {
    type: "dismiss_prospect",
    prospect_id: prospectId,
    prospect_name: prospect.name,
    actor: user?.full_name || user?.email || "admin",
    previous_value: prospect.status,
    new_value: "dismissed",
  });

  return Response.json({ success: true, prospect: updated });
}

async function handleApproveProspect(base44: any, body: any, user: any) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const settings = await getSettings(base44);
  const outreachStatus = settings.outreach_approval_required ? "pending_approval" : "approved";

  const updated = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    status: "approved",
    outreach_status: outreachStatus,
  });

  await logActivity(base44, {
    type: "approve_prospect",
    prospect_id: prospectId,
    prospect_name: prospect.name,
    actor: user?.full_name || user?.email || "admin",
    previous_value: prospect.status,
    new_value: "approved",
  });

  return Response.json({ success: true, prospect: updated });
}

// ─── Action: update_prospect_notes ───────────────────────────────────────────

async function handleUpdateProspectNotes(base44: any, body: any) {
  const { prospectId, notes } = body;
  const updated = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, { notes });
  return Response.json({ success: true, prospect: updated });
}

// ─── Action: find_similar ────────────────────────────────────────────────────

async function handleFindSimilar(base44: any, body: any, user: any) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const job = prospect.job_id
    ? await base44.asServiceRole.entities.HireJob.get(prospect.job_id).catch(() => null)
    : null;

  const jobTitle = job?.title || prospect.title || DEFAULT_SALES_TITLE;
  const skills = prospect.skills || [];
  const zipCode = prospect.zip_code || "";
  const radius = prospect.radius_miles || 50;

  const queries = [
    `"${jobTitle}" ${skills.slice(0, 2).join(" ")} ${zipCode}`,
    `similar to "${prospect.name}" ${prospect.company} ${jobTitle}`,
  ];

  const geocoded = zipCode ? await geocodeZip(zipCode) : null;
  const locationConstraint = geocoded
    ? `Candidates must be within approximately ${radius} miles of ${geocoded.displayName}.`
    : "";
  const seniorityInstructions = `Target seniority level: ${getSeniority(jobTitle)}. Accept similar titles at this level.`;

  const search = await base44.asServiceRole.entities.RecruitingSearch.create({
    strategy: "find_similar",
    queries,
    status: "running",
    job_id: prospect.job_id || null,
    zip_code: zipCode,
    radius_miles: radius,
  });

  try {
    const result = await runTalentResearch(base44, {
      job,
      strategy: "find_similar",
      queries,
      locationConstraint,
      seniorityInstructions,
      extraInstructions: `Find people similar to ${prospect.name} who works as ${prospect.title} at ${prospect.company}. Exclude ${prospect.name} from results.`,
    });

    const people = (result?.prospects || []).filter((p) => p.full_name?.toLowerCase() !== prospect.name?.toLowerCase());

    const freshProspects: any[] = [];
    for (const person of people) {
      const newProspect = personToProspect(person, prospect.job_id, search.id, zipCode, radius);
      freshProspects.push(newProspect);
    }

    if (freshProspects.length > 0) {
      await base44.asServiceRole.entities.RecruitingProspect.bulkCreate(freshProspects);
    }

    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "completed",
      results_count: freshProspects.length,
    });

    return Response.json({ success: true, fresh_prospects: freshProspects, search_id: search.id });
  } catch (error) {
    await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
      status: "failed",
      error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: generate_outreach_message ───────────────────────────────────────

async function handleGenerateOutreachMessage(base44: any, body: any, user: any) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const job = prospect.job_id
    ? await base44.asServiceRole.entities.HireJob.get(prospect.job_id).catch(() => null)
    : null;

  const settings = await getSettings(base44);

  const prompt = `Write a personalized, professional outreach message from ${COMPANY_NAME} to ${prospect.name}.

Context:
- Prospect: ${prospect.name}, ${prospect.title} at ${prospect.company}
- Location: ${prospect.location}
- Skills: ${(prospect.skills || []).join(", ")}
- Role: ${job?.title || DEFAULT_SALES_TITLE}
${job?.description ? `Role description: ${job.description}` : ""}

Guidelines:
1. Keep it concise (3-4 sentences).
2. Be warm and professional, not salesy.
3. Reference something specific from their background.
4. Explain why ${COMPANY_NAME} is reaching out and what the opportunity is.
5. Include a clear call to action (reply or schedule a call).
6. End with: "${settings.opt_out_language || "If you'd prefer not to receive these messages, reply STOP at any time."}"

Return only the message text, no JSON.`;

  const result = await base44.integrations.Core.InvokeLLM({
    prompt,
    model: "gemini_3_flash",
  });

  const message = typeof result === "string" ? result : result?.message || result?.text || String(result);

  await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    outreach_message: message,
  });

  await logActivity(base44, {
    type: "generate_outreach",
    prospect_id: prospectId,
    prospect_name: prospect.name,
    actor: user?.full_name || user?.email || "admin",
  });

  return Response.json({ success: true, message });
}

// ─── Action: convert_to_candidate ────────────────────────────────────────────

async function handleConvertToCandidate(base44: any, body: any, user: any) {
  const { prospectId, jobId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const targetJobId = jobId || prospect.job_id;
  if (!targetJobId) {
    return Response.json({ error: "No job specified — cannot convert to candidate" }, { status: 400 });
  }

  // Check for existing candidate with same email/name
  const existing = await base44.asServiceRole.entities.HireCandidate.filter(
    { job_id: targetJobId, email: prospect.name },
    "-created_date",
    1
  );

  let candidate;
  if (existing && existing.length > 0) {
    candidate = existing[0];
  } else {
    candidate = await base44.asServiceRole.entities.HireCandidate.create({
      job_id: targetJobId,
      name: prospect.name,
      email: "",
      phone: "",
      source: "recruiter",
      resume_text: `Converted from recruiting prospect. Title: ${prospect.title}, Company: ${prospect.company}, Location: ${prospect.location}. Skills: ${(prospect.skills || []).join(", ")}. LinkedIn: ${prospect.linkedin_url}`,
      status: "screening",
    });
  }

  await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    status: "converted",
  });

  await logActivity(base44, {
    type: "convert_to_candidate",
    prospect_id: prospectId,
    prospect_name: prospect.name,
    actor: user?.full_name || user?.email || "admin",
    previous_value: "approved",
    new_value: "converted",
    metadata: { candidate_id: candidate.id, job_id: targetJobId },
  });

  return Response.json({ success: true, candidate });
}

// ─── Action: pipelines ────────────────────────────────────────────────────────

async function handleListPipelines(base44: any) {
  const pipelines = await base44.asServiceRole.entities.TalentPipeline.list("-created_date", 100);
  return Response.json({ success: true, pipelines });
}

async function handleCreatePipeline(base44: any, body: any, user: any) {
  const pipeline = await base44.asServiceRole.entities.TalentPipeline.create({
    name: body.name,
    target_roles: body.target_roles || [],
    target_skills: body.target_skills || [],
    target_locations: body.target_locations || [],
    continuous_recruiting_enabled: body.continuous_recruiting_enabled || false,
    search_frequency_days: body.search_frequency_days || 7,
    job_id: body.job_id || null,
    max_prospects_per_cycle: body.max_prospects_per_cycle || 10,
    radius_miles: body.radius_miles || 50,
  });

  await logActivity(base44, {
    type: "create_pipeline",
    actor: user?.full_name || user?.email || "admin",
    metadata: { pipeline_id: pipeline.id, name: body.name },
  });

  return Response.json({ success: true, pipeline });
}

async function handleUpdatePipeline(base44: any, body: any) {
  const { id, ...data } = body;
  const pipeline = await base44.asServiceRole.entities.TalentPipeline.update(id, data);
  return Response.json({ success: true, pipeline });
}

async function handleDeletePipeline(base44: any, body: any) {
  const { id } = body;
  await base44.asServiceRole.entities.TalentPipeline.delete(id);
  return Response.json({ success: true });
}

// ─── Action: tasks ───────────────────────────────────────────────────────────

async function handleListTasks(base44: any, body: any) {
  const query: any = {};
  if (body.status) query.status = body.status;
  const tasks = await base44.asServiceRole.entities.RecruitingTask.filter(query, "due_date", 100);
  return Response.json({ success: true, tasks });
}

async function handleCreateTask(base44: any, body: any) {
  const task = await base44.asServiceRole.entities.RecruitingTask.create({
    type: body.type,
    due_date: body.due_date,
    prospect_id: body.prospect_id || null,
    prospect_name: body.prospect_name || null,
    notes: body.notes || "",
    assigned_to: body.assigned_to || null,
    assigned_to_name: body.assigned_to_name || null,
    job_id: body.job_id || null,
    status: "pending",
  });
  return Response.json({ success: true, task });
}

async function handleUpdateTask(base44: any, body: any) {
  const { id, ...data } = body;
  const task = await base44.asServiceRole.entities.RecruitingTask.update(id, data);
  return Response.json({ success: true, task });
}

async function handleDeleteTask(base44: any, body: any) {
  const { id } = body;
  await base44.asServiceRole.entities.RecruitingTask.delete(id);
  return Response.json({ success: true });
}

// ─── Action: activity ────────────────────────────────────────────────────────

async function handleListActivity(base44: any, body: any) {
  const query: any = {};
  if (body.prospectId) query.prospect_id = body.prospectId;
  const activity = await base44.asServiceRole.entities.RecruitingActivity.filter(
    query,
    "-created_date",
    body.limit || 50
  );
  return Response.json({ success: true, activity });
}

// ─── Action: assistant_home ──────────────────────────────────────────────────

async function handleAssistantHome(base44: any) {
  const allProspects = await base44.asServiceRole.entities.RecruitingProspect.list("-created_date", 500);
  const newProspects = allProspects.filter((p) => p.status === "new");
  const savedProspects = allProspects.filter((p) => p.status === "saved");
  const approvedProspects = allProspects.filter((p) => p.status === "approved");
  const contactedProspects = allProspects.filter((p) => p.status === "contacted");
  const convertedProspects = allProspects.filter((p) => p.status === "converted");

  const recentSearches = await base44.asServiceRole.entities.RecruitingSearch.filter(
    { status: "completed" },
    "-created_date",
    5
  );

  const openJobs = await base44.asServiceRole.entities.HireJob.filter({ status: "open" }, "-created_date", 10);

  const pipelines = await base44.asServiceRole.entities.TalentPipeline.list("-created_date", 50);
  const activePipelines = pipelines.filter((p) => p.continuous_recruiting_enabled);

  const pendingTasks = await base44.asServiceRole.entities.RecruitingTask.filter({ status: "pending" }, "due_date", 10);

  return Response.json({
    success: true,
    stats: {
      total_prospects: allProspects.length,
      new: newProspects.length,
      saved: savedProspects.length,
      approved: approvedProspects.length,
      contacted: contactedProspects.length,
      converted: convertedProspects.length,
      recent_searches: recentSearches.length,
      open_jobs: openJobs.length,
      active_pipelines: activePipelines.length,
      pending_tasks: pendingTasks.length,
    },
    recent_searches: recentSearches,
    open_jobs: openJobs,
    active_pipelines: activePipelines,
    pending_tasks: pendingTasks,
  });
}

// ─── Action: campaign_analytics ─────────────────────────────────────────────

async function handleCampaignAnalytics(base44: any) {
  const allProspects = await base44.asServiceRole.entities.RecruitingProspect.list("-created_date", 1000);
  const searches = await base44.asServiceRole.entities.RecruitingSearch.list("-created_date", 200);

  const funnel = {
    sourced: allProspects.length,
    saved: allProspects.filter((p) => p.status === "saved").length,
    approved: allProspects.filter((p) => p.status === "approved").length,
    contacted: allProspects.filter((p) => p.status === "contacted").length,
    responded: allProspects.filter((p) => p.outreach_status === "responded").length,
    converted: allProspects.filter((p) => p.status === "converted").length,
  };

  const searchesByDay: Record<string, number> = {};
  for (const s of searches) {
    if (s.status === "completed") {
      const day = (s.created_date || "").slice(0, 10);
      searchesByDay[day] = (searchesByDay[day] || 0) + 1;
    }
  }

  return Response.json({
    success: true,
    funnel,
    searches_by_day: searchesByDay,
    total_searches: searches.length,
    completed_searches: searches.filter((s) => s.status === "completed").length,
    failed_searches: searches.filter((s) => s.status === "failed").length,
  });
}

// ─── Action: get_settings / update_settings ──────────────────────────────────

async function handleGetSettings(base44: any) {
  const settings = await getSettings(base44);
  return Response.json({ success: true, settings });
}

async function handleUpdateSettings(base44: any, body: any) {
  const current = await getSettings(base44);
  const updated = await base44.asServiceRole.entities.RecruitingSettings.update(current.id, {
    recruiting_enabled: body.recruiting_enabled ?? current.recruiting_enabled,
    max_search_results: body.max_search_results ?? current.max_search_results,
    outreach_approval_required: body.outreach_approval_required ?? current.outreach_approval_required,
    opt_out_language: body.opt_out_language ?? current.opt_out_language,
    default_search_radius: body.default_search_radius ?? current.default_search_radius,
    continuous_recruiting_enabled: body.continuous_recruiting_enabled ?? current.continuous_recruiting_enabled,
  });
  return Response.json({ success: true, settings: updated });
}

// ─── Action: geocode_locations ───────────────────────────────────────────────

async function handleGeocodeLocations(base44: any, body: any) {
  const { prospectIds } = body;
  if (!prospectIds || !prospectIds.length) {
    return Response.json({ error: "prospectIds is required" }, { status: 400 });
  }

  const results: any[] = [];
  for (const id of prospectIds) {
    const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(id);
    if (!prospect) continue;
    if (prospect.lat && prospect.lon) {
      results.push({ id, lat: prospect.lat, lon: prospect.lon, name: prospect.name });
      continue;
    }
    // Try to geocode from location string
    if (prospect.location) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(prospect.location)}`;
        const resp = await fetch(url, { headers: { "User-Agent": "ArrivEstateMedia-Recruiting/1.0" } });
        const data = await resp.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          await base44.asServiceRole.entities.RecruitingProspect.update(id, { lat, lon });
          results.push({ id, lat, lon, name: prospect.name });
        }
      } catch {
        // skip
      }
    }
    // Rate limit for Nominatim
    await new Promise((r) => setTimeout(r, 1100));
  }

  return Response.json({ success: true, locations: results });
}

// ─── Action: run_continuous_cycle ────────────────────────────────────────────

async function handleRunContinuousCycle(base44: any, user: any) {
  const pipelines = await base44.asServiceRole.entities.TalentPipeline.filter(
    { continuous_recruiting_enabled: true },
    "-created_date",
    50
  );

  const results: any[] = [];
  for (const pipeline of pipelines) {
    // Check if enough time has passed
    const lastRun = pipeline.last_run_at ? new Date(pipeline.last_run_at) : new Date(0);
    const daysSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < (pipeline.search_frequency_days || 7)) {
      results.push({ pipeline_id: pipeline.id, name: pipeline.name, skipped: "too_soon" });
      continue;
    }

    // Run a search for each target location
    for (const location of pipeline.target_locations || []) {
      try {
        const job = pipeline.job_id
          ? await base44.asServiceRole.entities.HireJob.get(pipeline.job_id).catch(() => null)
          : null;

        const queries = buildQueriesFromStrategy("skills_based", job, location, pipeline.radius_miles || 50);
        const geocoded = await geocodeZip(location);
        if (!geocoded) continue;

        const locationConstraint = `Candidates must be within approximately ${pipeline.radius_miles || 50} miles of ${geocoded.displayName}.`;
        const jobTitle = job?.title || pipeline.target_roles?.[0] || DEFAULT_SALES_TITLE;
        const seniorityInstructions = `Target seniority level: ${getSeniority(jobTitle)}.`;

        const search = await base44.asServiceRole.entities.RecruitingSearch.create({
          strategy: "continuous",
          queries,
          status: "running",
          job_id: pipeline.job_id || null,
          zip_code: location,
          radius_miles: pipeline.radius_miles || 50,
          pipeline_id: pipeline.id,
        });

        const result = await runTalentResearch(base44, {
          job,
          strategy: "continuous",
          queries,
          locationConstraint,
          seniorityInstructions,
        });

        const people = (result?.prospects || []).slice(0, pipeline.max_prospects_per_cycle || 10);
        const freshProspects = people.map((p) => ({
          ...personToProspect(p, pipeline.job_id || null, search.id, location, pipeline.radius_miles || 50),
          pipeline_id: pipeline.id,
          status: "new",
        }));

        if (freshProspects.length > 0) {
          await base44.asServiceRole.entities.RecruitingProspect.bulkCreate(freshProspects);
        }

        await base44.asServiceRole.entities.RecruitingSearch.update(search.id, {
          status: "completed",
          results_count: freshProspects.length,
        });

        results.push({
          pipeline_id: pipeline.id,
          name: pipeline.name,
          location,
          new_prospects: freshProspects.length,
        });
      } catch (e) {
        results.push({ pipeline_id: pipeline.id, name: pipeline.name, error: e.message });
      }
    }

    await base44.asServiceRole.entities.TalentPipeline.update(pipeline.id, {
      last_run_at: new Date().toISOString(),
    });
  }

  await logActivity(base44, {
    type: "continuous_cycle",
    actor: user?.full_name || user?.email || "system",
    metadata: { pipelines_run: results.length },
  });

  return Response.json({ success: true, results });
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "natural_language_search":
        return await handleNaturalLanguageSearch(base44, body, user);
      case "run_search":
        return await handleRunSearch(base44, body, user);
      case "list_prospects":
        return await handleListProspects(base44, body);
      case "save_prospect":
        return await handleSaveProspect(base44, body, user);
      case "dismiss_prospect":
        return await handleDismissProspect(base44, body, user);
      case "approve_prospect":
        return await handleApproveProspect(base44, body, user);
      case "update_prospect_notes":
        return await handleUpdateProspectNotes(base44, body);
      case "find_similar":
        return await handleFindSimilar(base44, body, user);
      case "generate_outreach_message":
        return await handleGenerateOutreachMessage(base44, body, user);
      case "convert_to_candidate":
        return await handleConvertToCandidate(base44, body, user);
      case "list_pipelines":
        return await handleListPipelines(base44);
      case "create_pipeline":
        return await handleCreatePipeline(base44, body, user);
      case "update_pipeline":
        return await handleUpdatePipeline(base44, body);
      case "delete_pipeline":
        return await handleDeletePipeline(base44, body);
      case "list_tasks":
        return await handleListTasks(base44, body);
      case "create_task":
        return await handleCreateTask(base44, body);
      case "update_task":
        return await handleUpdateTask(base44, body);
      case "delete_task":
        return await handleDeleteTask(base44, body);
      case "list_activity":
        return await handleListActivity(base44, body);
      case "assistant_home":
        return await handleAssistantHome(base44);
      case "campaign_analytics":
        return await handleCampaignAnalytics(base44);
      case "get_settings":
        return await handleGetSettings(base44);
      case "update_settings":
        return await handleUpdateSettings(base44, body);
      case "geocode_locations":
        return await handleGeocodeLocations(base44, body);
      case "run_continuous_cycle":
        return await handleRunContinuousCycle(base44, user);
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("manageRecruiting error:", error);
    return Response.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
});