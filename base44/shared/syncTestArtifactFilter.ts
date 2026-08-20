// Shared test-artifact detection for Arriv One ⇄ Estate Media sync.
// Used by reconciliation, dry-run inventory, and migration planning to
// distinguish Phase 2 test records from genuine production business records.

const normalizeEmail = (e) => (e || "").toLowerCase().trim();
const digitsOnly = (p) => (p || "").replace(/\D/g, "");

// Email addresses that are definitively test artifacts.
const TEST_EMAIL_FRAGMENTS = [
  "@test.invalid",
  "test@example.com",
  "test@",
  "+test@",
];

// Name fragments that indicate a test record.
const TEST_NAME_EXACT = new Set([
  "test contact",
  "test user",
  "test record",
  "matrix-test user",
]);

/**
 * Returns true if a record is a Phase 2 test artifact.
 * Checks sync metadata, email fields, name fields, and phone fields.
 */
export function isTestArtifact(r: any): boolean {
  if (!r) return true;

  // Sync metadata patterns
  const sid = r.immutable_shared_id || "";
  if (sid.startsWith("test-out-") || sid.startsWith("test-in-") || sid.startsWith("test-")) return true;

  const oeid = r.origin_event_id || "";
  if (oeid.startsWith("test-")) return true;

  if (r._test === true || r._test_record === true) return true;

  // Email fields (check all known email field names)
  const emailFields = [r.email, r.contact_email, r.personal_email, r.company_email];
  for (const e of emailFields) {
    if (!e) continue;
    const el = normalizeEmail(e);
    for (const frag of TEST_EMAIL_FRAGMENTS) {
      if (el.includes(frag)) return true;
    }
    if (el.startsWith("test-") && el.includes("@")) return true;
  }

  // Name fields
  const nameFields = [r.full_name, r.firstname, r.contact_name, r.employee_name, r.author_name];
  for (const n of nameFields) {
    if (!n) continue;
    const nl = n.toLowerCase().trim();
    if (TEST_NAME_EXACT.has(nl)) return true;
    if (nl.startsWith("test ") || nl.startsWith("matrix-test")) return true;
  }

  // Phone fields (test ranges: 555-010x, 000-000-0000, etc.)
  const phoneFields = [r.phone, r.phone_number, r.from_number, r.to_number, r.mobile_phone_number];
  for (const p of phoneFields) {
    if (!p) continue;
    const d = digitsOnly(p);
    if (d.startsWith("555010") || d === "0000000000" || d === "1111111111") return true;
  }

  return false;
}

/**
 * Returns true if a CrossAppRecordMapping is a test artifact.
 */
export function isTestMapping(m: any): boolean {
  if (!m) return true;
  const sid = m.immutable_shared_id || "";
  if (sid.startsWith("test-out-") || sid.startsWith("test-in-") || sid.startsWith("test-")) return true;
  const rid = m.remote_record_id || "";
  if (rid.startsWith("test-local-") || rid.startsWith("test-")) return true;
  return false;
}

/**
 * Returns true if a sync event (SyncOutbox/SyncInbox) is a test artifact.
 */
export function isTestEvent(e: any): boolean {
  if (!e) return true;
  const sid = e.immutable_shared_id || "";
  if (sid.startsWith("test-")) return true;
  const eid = e.event_id || "";
  if (eid.startsWith("test-")) return true;
  if (e.payload?._test === true || e.payload?._test_record === true) return true;
  return false;
}