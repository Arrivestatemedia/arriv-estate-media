import { base44 } from "@/api/base44Client";

/**
 * Thin wrapper around the manageRecruiting backend function.
 * Every call passes { action, ...payload }.
 */
export async function recruitingApi(action, payload = {}) {
  const res = await base44.functions.invoke("manageRecruiting", { action, ...payload });
  if (res?.data?.error) {
    throw new Error(res.data.error);
  }
  return res.data;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function naturalLanguageSearch({ query, zipCode, radiusMiles, jobId }) {
  return recruitingApi("natural_language_search", { query, zipCode, radiusMiles, jobId });
}

export async function runSearch({ strategy, jobId, zipCode, radiusMiles, queries }) {
  return recruitingApi("run_search", { strategy, jobId, zipCode, radiusMiles, queries });
}

// ─── Prospects ───────────────────────────────────────────────────────────────

export async function listProspects({ status, jobId, pipelineId, limit, offset } = {}) {
  return recruitingApi("list_prospects", { status, jobId, pipelineId, limit, offset });
}

export async function saveProspect(prospectId) {
  return recruitingApi("save_prospect", { prospectId });
}

export async function dismissProspect(prospectId) {
  return recruitingApi("dismiss_prospect", { prospectId });
}

export async function approveProspect(prospectId) {
  return recruitingApi("approve_prospect", { prospectId });
}

export async function findSimilar(prospectId) {
  return recruitingApi("find_similar", { prospectId });
}

export async function generateOutreachMessage(prospectId) {
  return recruitingApi("generate_outreach_message", { prospectId });
}

export async function convertToCandidate(prospectId, jobId) {
  return recruitingApi("convert_to_candidate", { prospectId, jobId });
}

export async function updateProspectNotes(prospectId, notes) {
  return recruitingApi("update_prospect_notes", { prospectId, notes });
}

// ─── Pipelines ──────────────────────────────────────────────────────────────

export async function listPipelines() {
  return recruitingApi("list_pipelines");
}

export async function createPipeline(data) {
  return recruitingApi("create_pipeline", data);
}

export async function updatePipeline(id, data) {
  return recruitingApi("update_pipeline", { id, ...data });
}

export async function deletePipeline(id) {
  return recruitingApi("delete_pipeline", { id });
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function listTasks({ status } = {}) {
  return recruitingApi("list_tasks", { status });
}

export async function createTask(data) {
  return recruitingApi("create_task", data);
}

export async function updateTask(id, data) {
  return recruitingApi("update_task", { id, ...data });
}

export async function deleteTask(id) {
  return recruitingApi("delete_task", { id });
}

// ─── Activity ────────────────────────────────────────────────────────────────

export async function listActivity({ prospectId, limit } = {}) {
  return recruitingApi("list_activity", { prospectId, limit });
}

// ─── Dashboard / Analytics ──────────────────────────────────────────────────

export async function getAssistantHome() {
  return recruitingApi("assistant_home");
}

export async function getCampaignAnalytics() {
  return recruitingApi("campaign_analytics");
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSettings() {
  return recruitingApi("get_settings");
}

export async function updateSettings(data) {
  return recruitingApi("update_settings", data);
}

// ─── Map ────────────────────────────────────────────────────────────────────

export async function geocodeLocations(prospectIds) {
  return recruitingApi("geocode_locations", { prospectIds });
}

// ─── Continuous recruiting ───────────────────────────────────────────────────

export async function runContinuousCycle() {
  return recruitingApi("run_continuous_cycle");
}