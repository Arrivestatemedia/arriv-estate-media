// manageRecruiting/entry.ts
// Single-tenant recruiting manager for Arriv Estate Media.
// All actions route through here via { action, ...payload }.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  getSeniority,
  isSeniorityMismatch,
  runTalentResearch,
} from "../../shared/recruitingSearchProvider.ts";

const COMPANY_NAME = "Arriv Estate Media";
const DEFAULT_SALES_TITLE = "Sales Growth Advisor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Geocode a zip code using Nominatim (OpenStreetMap). Returns { lat, lng, city, state } or null. */
async function geocodeZip(zipCode) {
  if (!zipCode) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&postalcode=${encodeURIComponent(zipCode)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ArrivEstateMedia-Recruiting/1.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const hit = data[0];
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      displayName: hit.display_name || "",
    };
  } catch (e) {
    console.warn("geocodeZip failed:", e.message);
    return null;
  }
}

/** Geocode an arbitrary location string. Returns { lat, lng } or null. */
async function geocodeLocation(locationStr) {
  if (!locationStr) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locationStr)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ArrivEstateMedia-Recruiting/1.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    return null;
  }
}

/** Haversine distance in miles. */
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Lenient local-location check. Trusts the LLM's location string — only rejects
 * if we have geocoded coords for both and the distance clearly exceeds the radius.
 */
function isLocationLocal(prospectLat, prospectLng, zipLat, zipLng, radiusMiles) {
  // If we don't have prospect coords, trust the LLM (lenient).
  if (!prospectLat || !prospectLng) return true;
  // If we don't have zip coords, trust the LLM.
  if (!zipLat || !zipLng) return true;
  const dist = distanceMiles(zipLat, zipLng, prospectLat, prospectLng);
  // Allow 20% slack to avoid dropping edge-of-radius candidates.
  return dist <= radiusMiles * 1.2;
}

/** Maps a raw LLM person object to a RecruitingProspect record. */
function personToProspect(person, { jobId, pipelineId, searchId, zipLat, zipLng, radiusMiles, jobTitle }) {
  const seniorityLevel = person.seniority_level ?? getSeniority(person.current_title);
  const seniorityMismatch = jobTitle ? isSeniorityMismatch(jobTitle, person.current_title) : false;
  const local = isLocationLocal(person.location_lat, person.location_lng, zipLat, zipLng, radiusMiles);

  return {
    job_id: jobId || null,
    pipeline_id: pipelineId || null,
    search_id: searchId || null,
    full_name: person.full_name || "",
    current_title: person.current_title || "",
    current_company: person.current_company || "",
    public_location: person.public_location || "",
    location_lat: person.location_lat || null,
    location_lng: person.location_lng || null,
    location_local: local,
    skills: Array.isArray(person.skills) ? person.skills : [],
    linkedin_url: person.linkedin_url || "",
    source_url: person.source_url || "",
    source_records: Array.isArray(person.source_records) ? person.source_records : [],
    contact_records: Array.isArray(person.contact_records) ? person.contact_records : [],
    seniority_level: seniorityLevel,
    seniority_filtered: seniorityMismatch,
    location_filtered: !local,
    status: "new",
    outreach_status: "not_started",
    do_not_contact: false,
    consent_status: "unknown",
  };
}

/** Checks if a prospect is a duplicate of an existing one (by name + company or linkedin_url). */
function isDuplicate(prospect, existing) {
  if (!existing || existing.length === 0) return false;
  const norm = (s) => (s || "").toLowerCase().trim();
  const pName = norm(prospect.full_name);
  const pCompany = norm(prospect.current_company);
  const pLinkedin = norm(prospect.linkedin_url);
  return existing.some((e) => {
    if (pLinkedin && pLinkedin === norm(e.linkedin_url)) return true;
    return pName && pName === norm(e.full_name) && pCompany && pCompany === norm(e.current_company);
  });
}

/** Builds search queries from a strategy + job. */
function buildQueriesFromStrategy({ strategy, job, naturalLanguageInput, zipCode, radiusMiles }) {
  const jobTitle = job?.title || DEFAULT_SALES_TITLE;
  const skills = job?.skills || [];
  const queries = [];

  if (strategy === "natural_language" && naturalLanguageInput) {
    queries.push(naturalLanguageInput);
    queries.push(`${jobTitle} ${naturalLanguageInput}`);
  } else if (strategy === "job_based" && job) {
    queries.push(`${jobTitle} real estate ${zipCode || ""}`.trim());
    if (skills.length) queries.push(`${skills.slice(0, 3).join(" ")} ${jobTitle}`);
    queries.push(`${jobTitle} site:linkedin.com/in`);
  } else if (strategy === "find_similar") {
    // queries built by caller
  } else {
    queries.push(`${jobTitle} professional ${zipCode || ""}`.trim());
  }

  return queries.filter(Boolean);
}

/** Logs a recruiting activity record. */
async function logActivity(base44, { type, prospectId, prospectName, pipelineId, searchId, actor, previousValue, newValue, description }) {
  try {
    await base44.asServiceRole.entities.RecruitingActivity.create({
      type,
      prospect_id: prospectId || null,
      prospect_name: prospectName || null,
      pipeline_id: pipelineId || null,
      search_id: searchId || null,
      actor: actor || "system",
      previous_value: previousValue || null,
      new_value: newValue || null,
      description: description || "",
    });
  } catch (e) {
    console.warn("logActivity failed:", e.message);
  }
}

/** Gets or creates the single RecruitingSettings row. */
async function getSettings(base44) {
  const rows = await base44.asServiceRole.entities.RecruitingSettings.list();
  const list = rows?.data ?? rows;
  if (Array.isArray(list) && list.length > 0) return list[0];
  const created = await base44.asServiceRole.entities.RecruitingSettings.create({
    recruiting_enabled: true,
    max_search_results: 10,
    outreach_approval_required: true,
    company_name: COMPANY_NAME,
    default_sales_title: DEFAULT_SALES_TITLE,
  });
  return created?.data ?? created;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleRunSearch(base44, body, user) {
  const { jobId, strategy, queries: rawQueries, zipCode, radiusMiles, naturalLanguageInput, pipelineId } = body;
  const settings = await getSettings(base44);
  if (!settings.recruiting_enabled) {
    return Response.json({ error: "Recruiting module is disabled" }, { status: 403 });
  }

  let job = null;
  if (jobId) {
    try {
      job = await base44.asServiceRole.entities.HireJob.get(jobId);
    } catch (_) {}
  }

  const queries = rawQueries && rawQueries.length
    ? rawQueries
    : buildQueriesFromStrategy({ strategy: strategy || "job_based", job, naturalLanguageInput, zipCode, radiusMiles });

  // Create search record
  const search = await base44.asServiceRole.entities.RecruitingSearch.create({
    job_id: jobId || null,
    pipeline_id: pipelineId || null,
    strategy: strategy || "job_based",
    queries,
    natural_language_input: naturalLanguageInput || "",
    zip_code: zipCode || "",
    radius_miles: radiusMiles || settings.default_radius_miles || 25,
    status: "running",
    run_by_id: user?.id || null,
    run_by_name: user?.full_name || "Admin",
  });
  const searchRec = search?.data ?? search;

  // Geocode zip
  const zipGeo = await geocodeZip(zipCode);
  const jobTitle = job?.title || settings.default_sales_title || DEFAULT_SALES_TITLE;

  const extraInstructions = [
    `Target hiring area: zip code ${zipCode || "not specified"} within ${radiusMiles || 25} miles.`,
    zipGeo ? `Geocoded center: ${zipGeo.displayName}.` : "",
    `Seniority target: ${jobTitle} (level ${getSeniority(jobTitle)}). Reject prospects whose seniority is far above this level.`,
    `Return up to ${settings.max_search_results || 10} real prospects.`,
  ].filter(Boolean).join("\n");

  try {
    const people = await runTalentResearch(base44, { job, strategy, queries, extraInstructions });

    // Dedup + filter
    const existingProspects = await base44.asServiceRole.entities.RecruitingProspect.list("-created_date", 200);
    const existingList = existingProspects?.data ?? existingProspects ?? [];

    const fresh = [];
    let seniorityFiltered = 0;
    let locationFiltered = 0;

    for (const person of people) {
      const prospect = personToProspect(person, {
        jobId, pipelineId, searchId: searchRec.id, zipLat: zipGeo?.lat, zipLng: zipGeo?.lng, radiusMiles: radiusMiles || 25, jobTitle,
      });

      if (prospect.seniority_filtered) { seniorityFiltered++; continue; }
      if (!prospect.location_local) { locationFiltered++; continue; }
      if (isDuplicate(prospect, existingList)) continue;
      if (isDuplicate(prospect, fresh)) continue;

      fresh.push(prospect);
    }

    // Bulk create fresh prospects
    let created = [];
    if (fresh.length > 0) {
      const res = await base44.asServiceRole.entities.RecruitingProspect.bulkCreate(fresh);
      created = res?.data ?? res ?? [];
    }

    // Update search record
    await base44.asServiceRole.entities.RecruitingSearch.update(searchRec.id, {
      status: "completed",
      results_count: people.length,
      fresh_count: Array.isArray(created) ? created.length : 0,
      seniority_filtered_count: seniorityFiltered,
      location_filtered_count: locationFiltered,
    });

    await logActivity(base44, {
      type: "search_run",
      search_id: searchRec.id,
      actor: user?.full_name || "Admin",
      description: `Search found ${people.length} people, ${Array.isArray(created) ? created.length : 0} fresh prospects.`,
    });

    return Response.json({
      success: true,
      search_id: searchRec.id,
      fresh_prospects: Array.isArray(created) ? created : [],
      seniority_filtered: seniorityFiltered,
      location_filtered: locationFiltered,
      total_found: people.length,
    });
  } catch (err) {
    await base44.asServiceRole.entities.RecruitingSearch.update(searchRec.id, {
      status: err.message?.includes("timed out") ? "timeout" : "failed",
      error_message: err.message,
    });
    return Response.json({ error: err.message, search_id: searchRec.id }, { status: 500 });
  }
}

async function handleNaturalLanguageSearch(base44, body, user) {
  const { input, zipCode, radiusMiles, jobId, pipelineId } = body;
  if (!zipCode) {
    return Response.json({ error: "A zip code is required for local recruiting" }, { status: 400 });
  }
  if (!input || !input.trim()) {
    return Response.json({ error: "Search input is required" }, { status: 400 });
  }

  return handleRunSearch(base44, {
    jobId,
    pipelineId,
    strategy: "natural_language",
    naturalLanguageInput: input,
    zipCode,
    radiusMiles: radiusMiles || 25,
  }, user);
}

async function handleListProspects(base44, body) {
  const { status, jobId, pipelineId, limit } = body;
  const filter = {};
  if (status) filter.status = status;
  if (jobId) filter.job_id = jobId;
  if (pipelineId) filter.pipeline_id = pipelineId;
  const res = await base44.asServiceRole.entities.RecruitingProspect.filter(filter, "-created_date", limit || 100);
  return Response.json({ success: true, prospects: res?.data ?? res ?? [] });
}

async function handleGetProspect(base44, body) {
  const { prospectId } = body;
  if (!prospectId) return Response.json({ error: "prospectId required" }, { status: 400 });
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  const activity = await base44.asServiceRole.entities.RecruitingActivity.filter({ prospect_id: prospectId }, "-created_date", 20);
  return Response.json({ success: true, prospect, activity: activity?.data ?? activity ?? [] });
}

async function handleSaveProspect(base44, body, user) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, { status: "saved" });
  await logActivity(base44, { type: "prospect_saved", prospectId, prospect_name: prospect?.full_name, actor: user?.full_name });
  return Response.json({ success: true, prospect });
}

async function handleDismissProspect(base44, body, user) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, { status: "dismissed" });
  await logActivity(base44, { type: "prospect_dismissed", prospectId, prospect_name: prospect?.full_name, actor: user?.full_name });
  return Response.json({ success: true, prospect });
}

async function handleApproveProspect(base44, body, user) {
  const { prospectId } = body;
  const prev = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, { status: "approved" });
  await logActivity(base44, {
    type: "prospect_approved",
    prospectId,
    prospect_name: prospect?.full_name,
    actor: user?.full_name,
    previous_value: prev?.status,
    new_value: "approved",
  });
  return Response.json({ success: true, prospect });
}

async function handleFindSimilar(base44, body, user) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const settings = await getSettings(base44);
  const job = prospect.job_id ? await base44.asServiceRole.entities.HireJob.get(prospect.job_id).catch(() => null) : null;
  const jobTitle = job?.title || prospect.current_title || settings.default_sales_title || DEFAULT_SALES_TITLE;

  const queries = [
    `${prospect.current_title} ${prospect.current_company} similar professionals`,
    `${jobTitle} ${prospect.public_location || ""}`.trim(),
    `${prospect.skills?.slice(0, 3).join(" ")} ${jobTitle}`,
  ].filter(Boolean);

  return handleRunSearch(base44, {
    jobId: prospect.job_id,
    pipelineId: prospect.pipeline_id,
    strategy: "find_similar",
    queries,
    zipCode: null,
    radiusMiles: settings.default_radius_miles || 25,
  }, user);
}

async function handleGenerateOutreachMessage(base44, body, user) {
  const { prospectId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const settings = await getSettings(base44);
  let job = null;
  if (prospect.job_id) {
    job = await base44.asServiceRole.entities.HireJob.get(prospect.job_id).catch(() => null);
  }
  const jobTitle = job?.title || settings.default_sales_title || DEFAULT_SALES_TITLE;

  const prompt = `Write a concise, warm, professional outreach message from ${COMPANY_NAME} to ${prospect.full_name}.

Context:
- Prospect current title: ${prospect.current_title}
- Prospect company: ${prospect.current_company}
- Prospect location: ${prospect.public_location}
- Role we're hiring for: ${jobTitle}
- Key skills we want: ${(job?.skills || []).join(", ") || "not specified"}

Rules:
- Keep it under 120 words.
- Be genuine, not salesy. Reference their background specifically.
- End with: "${settings.opt_out_language || "Reply STOP to opt out at any time."}"
- Do not fabricate details about the person.
- Return only the message text, no JSON.`;

  const result = await base44.integrations.Core.InvokeLLM({ prompt });
  const message = typeof result === "string" ? result : result?.output || result?.text || "";

  await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    outreach_message: message,
    outreach_status: "drafted",
  });
  await logActivity(base44, { type: "outreach_drafted", prospectId, prospect_name: prospect.full_name, actor: user?.full_name });

  return Response.json({ success: true, message });
}

async function handleConvertToCandidate(base44, body, user) {
  const { prospectId, jobId } = body;
  const prospect = await base44.asServiceRole.entities.RecruitingProspect.get(prospectId);
  if (!prospect) return Response.json({ error: "Prospect not found" }, { status: 404 });

  const targetJobId = jobId || prospect.job_id;
  if (!targetJobId) return Response.json({ error: "A job_id is required to convert a prospect" }, { status: 400 });

  // Create a HireCandidate from the prospect
  const candidate = await base44.asServiceRole.entities.HireCandidate.create({
    job_id: targetJobId,
    name: prospect.full_name,
    email: "",
    phone: "",
    source: "recruiter",
    resume_text: `${prospect.current_title} at ${prospect.current_company}\n${prospect.public_location}\nSkills: ${(prospect.skills || []).join(", ")}\nLinkedIn: ${prospect.linkedin_url}`,
    status: "applied",
  });
  const candidateRec = candidate?.data ?? candidate;

  await base44.asServiceRole.entities.RecruitingProspect.update(prospectId, {
    status: "converted",
    converted_candidate_id: candidateRec.id,
  });
  await logActivity(base44, {
    type: "prospect_converted",
    prospectId,
    prospect_name: prospect.full_name,
    actor: user?.full_name,
    new_value: candidateRec.id,
  });

  return Response.json({ success: true, candidate_id: candidateRec.id });
}

// ---- Pipelines ----

async function handleListPipelines(base44) {
  const res = await base44.asServiceRole.entities.TalentPipeline.list("-created_date", 50);
  return Response.json({ success: true, pipelines: res?.data ?? res ?? [] });
}

async function handleCreatePipeline(base44, body, user) {
  const { name, jobId, targetRoles, targetSkills, targetLocations, targetRadiusMiles, continuousRecruitingEnabled, searchFrequencyDays, maxProspectsPerCycle } = body;
  const pipeline = await base44.asServiceRole.entities.TalentPipeline.create({
    name,
    job_id: jobId || null,
    target_roles: targetRoles || [],
    target_skills: targetSkills || [],
    target_locations: targetLocations || [],
    target_radius_miles: targetRadiusMiles || 25,
    continuous_recruiting_enabled: continuousRecruitingEnabled || false,
    search_frequency_days: searchFrequencyDays || 7,
    max_prospects_per_cycle: maxProspectsPerCycle || 15,
    is_active: true,
    created_by_name: user?.full_name || "Admin",
  });
  const rec = pipeline?.data ?? pipeline;
  await logActivity(base44, { type: "pipeline_created", pipeline_id: rec.id, actor: user?.full_name, new_value: name });
  return Response.json({ success: true, pipeline: rec });
}

async function handleUpdatePipeline(base44, body) {
  const { pipelineId, data } = body;
  const pipeline = await base44.asServiceRole.entities.TalentPipeline.update(pipelineId, data);
  return Response.json({ success: true, pipeline });
}

async function handleDeletePipeline(base44, body) {
  const { pipelineId } = body;
  await base44.asServiceRole.entities.TalentPipeline.delete(pipelineId);
  return Response.json({ success: true });
}

// ---- Tasks ----

async function handleListTasks(base44, body) {
  const { status } = body;
  const filter = {};
  if (status) filter.status = status;
  const res = await base44.asServiceRole.entities.RecruitingTask.filter(filter, "due_date", 50);
  return Response.json({ success: true, tasks: res?.data ?? res ?? [] });
}

async function handleCreateTask(base44, body, user) {
  const { type, prospectId, prospectName, pipelineId, title, description, dueDate, priority } = body;
  const task = await base44.asServiceRole.entities.RecruitingTask.create({
    type: type || "general",
    prospect_id: prospectId || null,
    prospect_name: prospectName || null,
    pipeline_id: pipelineId || null,
    title: title || "",
    description: description || "",
    due_date: dueDate || null,
    priority: priority || "medium",
    status: "pending",
    assigned_to_name: user?.full_name || "Admin",
  });
  await logActivity(base44, { type: "task_created", prospectId, pipeline_id: pipelineId, actor: user?.full_name, new_value: title });
  return Response.json({ success: true, task: task?.data ?? task });
}

async function handleCompleteTask(base44, body, user) {
  const { taskId } = body;
  const task = await base44.asServiceRole.entities.RecruitingTask.update(taskId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });
  await logActivity(base44, { type: "task_completed", actor: user?.full_name, new_value: taskId });
  return Response.json({ success: true, task });
}

// ---- Activity ----

async function handleListActivity(base44, body) {
  const { limit } = body;
  const res = await base44.asServiceRole.entities.RecruitingActivity.list("-created_date", limit || 50);
  return Response.json({ success: true, activity: res?.data ?? res ?? [] });
}

// ---- Assistant Home ----

async function handleAssistantHome(base44) {
  const settings = await getSettings(base44);
  const jobsRes = await base44.asServiceRole.entities.HireJob.filter({ status: "open" }, "-created_date", 20);
  const openJobs = jobsRes?.data ?? jobsRes ?? [];
  const prospectsRes = await base44.asServiceRole.entities.RecruitingProspect.list("-created_date", 200);
  const allProspects = prospectsRes?.data ?? prospectsRes ?? [];
  const pipelinesRes = await base44.asServiceRole.entities.TalentPipeline.filter({ is_active: true }, "-created_date", 20);
  const activePipelines = pipelinesRes?.data ?? pipelinesRes ?? [];
  const tasksRes = await base44.asServiceRole.entities.RecruitingTask.filter({ status: "pending" }, "due_date", 10);
  const pendingTasks = tasksRes?.data ?? tasksRes ?? [];

  return Response.json({
    success: true,
    settings,
    open_jobs: openJobs,
    stats: {
      total_prospects: allProspects.length,
      new_prospects: allProspects.filter((p) => p.status === "new").length,
      saved_prospects: allProspects.filter((p) => p.status === "saved").length,
      approved_prospects: allProspects.filter((p) => p.status === "approved").length,
      converted_prospects: allProspects.filter((p) => p.status === "converted").length,
      active_pipelines: activePipelines.length,
      pending_tasks: pendingTasks.length,
    },
    active_pipelines: activePipelines,
    pending_tasks: pendingTasks,
  });
}

// ---- Analytics ----

async function handleCampaignAnalytics(base44) {
  const prospectsRes = await base44.asServiceRole.entities.RecruitingProspect.list("-created_date", 500);
  const allProspects = prospectsRes?.data ?? prospectsRes ?? [];
  const searchesRes = await base44.asServiceRole.entities.RecruitingSearch.list("-created_date", 100);
  const allSearches = searchesRes?.data ?? searchesRes ?? [];

  const funnel = {
    found: allProspects.length,
    saved: allProspects.filter((p) => p.status === "saved" || p.status === "approved" || p.status === "converted" || p.status === "contacted").length,
    approved: allProspects.filter((p) => p.status === "approved" || p.status === "converted" || p.status === "contacted").length,
    contacted: allProspects.filter((p) => p.status === "contacted" || p.status === "responded").length,
    responded: allProspects.filter((p) => p.status === "responded").length,
    converted: allProspects.filter((p) => p.status === "converted").length,
  };

  const searches = allSearches.map((s) => ({
    id: s.id,
    strategy: s.strategy,
    status: s.status,
    results_count: s.results_count || 0,
    fresh_count: s.fresh_count || 0,
    created_date: s.created_date,
  }));

  return Response.json({ success: true, funnel, searches, total_searches: allSearches.length });
}

// ---- Settings ----

async function handleGetSettings(base44) {
  const settings = await getSettings(base44);
  return Response.json({ success: true, settings });
}

async function handleUpdateSettings(base44, body, user) {
  const settings = await getSettings(base44);
  const updated = await base44.asServiceRole.entities.RecruitingSettings.update(settings.id, body);
  await logActivity(base44, { type: "settings_updated", actor: user?.full_name });
  return Response.json({ success: true, settings: updated?.data ?? updated });
}

// ---- Geocode locations ----

async function handleGeocodeLocations(base44, body) {
  const { prospectIds } = body;
  if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
    // Geocode all prospects missing coords
    const res = await base44.asServiceRole.entities.RecruitingProspect.filter({}, "-created_date", 200);
    const all = res?.data ?? res ?? [];
    const missing = all.filter((p) => !p.location_lat && p.public_location);
    for (const p of missing) {
      const geo = await geocodeLocation(p.public_location);
      if (geo) {
        await base44.asServiceRole.entities.RecruitingProspect.update(p.id, { location_lat: geo.lat, location_lng: geo.lng });
      }
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit
    }
    return Response.json({ success: true, geocoded: missing.length });
  }

  let count = 0;
  for (const id of prospectIds) {
    const p = await base44.asServiceRole.entities.RecruitingProspect.get(id);
    if (p && !p.location_lat && p.public_location) {
      const geo = await geocodeLocation(p.public_location);
      if (geo) {
        await base44.asServiceRole.entities.RecruitingProspect.update(id, { location_lat: geo.lat, location_lng: geo.lng });
        count++;
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return Response.json({ success: true, geocoded: count });
}

// ---- Continuous recruiting cycle ----

async function handleRunContinuousCycle(base44, _body, user) {
  const settings = await getSettings(base44);
  if (!settings.recruiting_enabled) return Response.json({ success: false, message: "Recruiting disabled" });

  const res = await base44.asServiceRole.entities.TalentPipeline.filter({ is_active: true, continuous_recruiting_enabled: true }, "-created_date", 50);
  const pipelines = res?.data ?? res ?? [];
  const now = Date.now();
  const freqDays = settings.search_frequency_days || 7;
  let totalNew = 0;

  for (const pipeline of pipelines) {
    const lastRun = pipeline.last_run_at ? new Date(pipeline.last_run_at).getTime() : 0;
    if (now - lastRun < freqDays * 86400000) continue;

    const job = pipeline.job_id ? await base44.asServiceRole.entities.HireJob.get(pipeline.job_id).catch(() => null) : null;
    const jobTitle = job?.title || pipeline.target_roles?.[0] || settings.default_sales_title || DEFAULT_SALES_TITLE;
    const zipCode = pipeline.target_locations?.[0] || "";
    const radiusMiles = pipeline.target_radius_miles || settings.default_radius_miles || 25;
    const maxPerCycle = pipeline.max_prospects_per_cycle || settings.max_prospects_per_cycle || 15;

    const queries = [
      `${jobTitle} ${pipeline.target_skills?.slice(0, 3).join(" ") || ""} ${zipCode}`.trim(),
      `${jobTitle} site:linkedin.com/in ${zipCode}`.trim(),
    ];

    try {
      const searchRes = await handleRunSearch(base44, {
        pipelineId: pipeline.id,
        jobId: pipeline.job_id,
        strategy: "pipeline_continuous",
        queries,
        zipCode,
        radiusMiles,
      }, user);
      const data = await searchRes.json();
      totalNew += data.fresh_prospects?.length || 0;
    } catch (e) {
      console.warn(`Continuous cycle failed for pipeline ${pipeline.id}:`, e.message);
    }

    await base44.asServiceRole.entities.TalentPipeline.update(pipeline.id, { last_run_at: new Date().toISOString() });

    if (totalNew >= maxPerCycle) break;
  }

  return Response.json({ success: true, pipelines_processed: pipelines.length, new_prospects: totalNew });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const action = body?.action;
    if (!action) return Response.json({ error: "action is required" }, { status: 400 });

    const handlers = {
      run_search: () => handleRunSearch(base44, body, user),
      natural_language_search: () => handleNaturalLanguageSearch(base44, body, user),
      list_prospects: () => handleListProspects(base44, body),
      get_prospect: () => handleGetProspect(base44, body),
      save_prospect: () => handleSaveProspect(base44, body, user),
      dismiss_prospect: () => handleDismissProspect(base44, body, user),
      approve_prospect: () => handleApproveProspect(base44, body, user),
      find_similar: () => handleFindSimilar(base44, body, user),
      generate_outreach_message: () => handleGenerateOutreachMessage(base44, body, user),
      convert_to_candidate: () => handleConvertToCandidate(base44, body, user),
      list_pipelines: () => handleListPipelines(base44),
      create_pipeline: () => handleCreatePipeline(base44, body, user),
      update_pipeline: () => handleUpdatePipeline(base44, body),
      delete_pipeline: () => handleDeletePipeline(base44, body),
      list_tasks: () => handleListTasks(base44, body),
      create_task: () => handleCreateTask(base44, body, user),
      complete_task: () => handleCompleteTask(base44, body, user),
      list_activity: () => handleListActivity(base44, body),
      assistant_home: () => handleAssistantHome(base44),
      campaign_analytics: () => handleCampaignAnalytics(base44),
      get_settings: () => handleGetSettings(base44),
      update_settings: () => handleUpdateSettings(base44, body, user),
      geocode_locations: () => handleGeocodeLocations(base44, body),
      run_continuous_cycle: () => handleRunContinuousCycle(base44, body, user),
    };

    const handler = handlers[action];
    if (!handler) return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

    return await handler();
  } catch (error) {
    console.error("manageRecruiting error:", error.message, error.stack);
    return Response.json({ error: error.message || "Internal error" }, { status: 500 });
  }
});