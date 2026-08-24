import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifyCertificationAuth, buildCertificationResult, redactSensitiveData } from "../../shared/certificationContract.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await verifyCertificationAuth(req);
    if (!auth.authenticated) return Response.json({ success: false, result: "FAIL", reason: auth.error }, { status: 401 });

    const body = auth.body;
    const { canary_id, synthetic_run_id, phase, canonical_event_id } = body;
    const startedAt = new Date().toISOString();
    const appId = "arriv_estate_media";
    let result;

    switch (canary_id) {
      case "assist_host_arriv_estate_media":
        result = await canaryAssistHost(base44, synthetic_run_id, phase);
        break;
      case "one_to_estate_sync":
      case "khetha_to_estate_handoff":
      case "estate_to_one_sync":
      case "estate_to_payroll_sync":
      case "estate_to_khetha_sync":
        result = buildCertificationResult({ success: false, canary_id, synthetic_run_id: synthetic_run_id, application_id: appId, source_application: "arriv_assist", destination_application: appId, execution_type: "CODE_TRACE", result: "NOT_TESTED", evidence: { reason: "CANARY_REQUIRES_SOURCE_CONFIRMED_INTEGRATION_LOGIC", phase: phase || "execute" }, started_at: startedAt, completed_at: new Date().toISOString() });
        break;
      default:
        result = buildCertificationResult({ success: false, canary_id, synthetic_run_id: synthetic_run_id, application_id: appId, source_application: "arriv_assist", destination_application: appId, execution_type: "CODE_TRACE", result: "NOT_TESTED", evidence: { reason: "CANARY_NOT_IMPLEMENTED" }, started_at: startedAt, completed_at: new Date().toISOString() });
    }
    result.evidence = redactSensitiveData(result.evidence);
    return Response.json(result);
  } catch (error) { return Response.json({ success: false, result: "FAIL", reason: error.message }, { status: 500 }); }
});

async function canaryAssistHost(base44, runId, phase) {
  const startedAt = new Date().toISOString();
  const endpoint = Deno.env.get("ARRIV_ASSIST_ENDPOINT"); const secret = Deno.env.get("ARRIV_ASSIST_AUTH_SECRET");
  const configured = !!(endpoint && secret);
  return buildCertificationResult({ success: configured, canary_id: "assist_host_arriv_estate_media", synthetic_run_id: runId, application_id: "arriv_estate_media", source_application: "arriv_assist", destination_application: "arriv_estate_media", execution_type: "LIVE_LOCAL_RUNTIME", result: configured ? "PASS" : "NOT_TESTED", evidence: { assist_endpoint_configured: !!endpoint, assist_secret_configured: !!secret, phase: phase || "execute" }, started_at: startedAt, completed_at: new Date().toISOString() });
}
