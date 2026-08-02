// recruitingApi.js
// Thin wrapper that calls the manageRecruiting backend function.

import { base44 } from "@/api/base44Client";

export async function callRecruiting(action, payload = {}) {
  const res = await base44.functions.invoke("manageRecruiting", { action, ...payload });
  return res?.data ?? res;
}

// ---- Search ----
export function runSearch({ jobId, strategy, queries, zipCode, radiusMiles, naturalLanguageInput, pipelineId }) {
  return callRecruiting("run_search", { jobId, strategy, queries, zipCode, radiusMiles, naturalLanguageInput, pipelineId });
}

export function naturalLanguageSearch({ input, zipCode, radiusMiles, jobId, pipelineId }) {
  return callRecruiting("natural_language_search", { input, zipCode, radiusMiles, jobId, pipelineId });
}

// ---- Prospects ----
export function listProspects({ status, jobId, pipelineId, limit } = {}) {
  return callRecruiting("list_prospects", { status, jobId, pipelineId, limit });
}

export function saveProspect(prospectId) {
  return callRecruiting("save_prospect", { prospectId });
}

export function dismissProspect(prospectId) {
  return callRecruiting("dismiss_prospect", { prospectId });
}

export function approveProspect(prospectId) {
  return callRecruiting("approve_prospect", { prospectId });
}

export function findSimilar(prospectId) {
  return callRecruiting("find_similar", { prospectId });
}

export function generateOutreachMessage(prospectId) {
  return callRecruiting("generate_outreach_message", { prospectId });
}

export function convertToCandidate(prospectId, jobId) {
  return callRecruiting("convert_to_candidate", { prospectId, jobId });
}

export function getProspectProfile(prospectId) {
  return callRecruiting("get_prospect", { prospectId });
}

// ---- Pipelines ----
export function listPipelines() {
  return callRecruiting("list_pipelines");
}

export function createPipeline(data) {
  return callRecruiting("create_pipeline", data);
}

export function updatePipeline(pipelineId, data) {
  return callRecruiting("update_pipeline", { pipelineId, data });
}

export function deletePipeline(pipelineId) {
  return callRecruiting("delete_pipeline", { pipelineId });
}

// ---- Tasks ----
export function listTasks({ status } = {}) {
  return callRecruiting("list_tasks", { status });
}

export function createTask(data) {
  return callRecruiting("create_task", data);
}

export function completeTask(taskId) {
  return callRecruiting("complete_task", { taskId });
}

// ---- Activity ----
export function listActivity({ limit } = {}) {
  return callRecruiting("list_activity", { limit });
}

// ---- Assistant Home ----
export function getAssistantHome() {
  return callRecruiting("assistant_home");
}

// ---- Analytics ----
export function getCampaignAnalytics() {
  return callRecruiting("campaign_analytics");
}

// ---- Settings ----
export function getSettings() {
  return callRecruiting("get_settings");
}

export function updateSettings(data) {
  return callRecruiting("update_settings", data);
}

// ---- Geocode ----
export function geocodeLocations(prospectIds) {
  return callRecruiting("geocode_locations", { prospectIds });
}

// ---- Continuous cycle ----
export function runContinuousCycle() {
  return callRecruiting("run_continuous_cycle");
}