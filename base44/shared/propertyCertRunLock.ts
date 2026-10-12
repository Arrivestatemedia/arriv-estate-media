// Property Visibility certification — server-enforced single-run lock.
//
// One active certification run at a time, with a bounded lifetime and safe recovery:
//   * stored in the existing AppSetting entity (key PROPERTY_CERT_RUN_LOCK), so no new entity
//     and no new storage is introduced;
//   * bounded: a run holds the lock for a fixed TTL and the lock is released in the runner's
//     finally block, so an interrupted run cannot block certification forever;
//   * recoverable: an expired lock is taken over, and the takeover records which run it took
//     over from;
//   * verified after writing: because the store has no compare-and-swap, the acquirer re-reads
//     its own claim token after a short settle window and aborts if it is not the stored holder.
//     A run that fails verification never touches a record;
//   * releasable only by its holder: a run can never release another run's lock.

import {
  PROPERTY_CERT_RUN_LOCK_KEY,
  PROPERTY_CERT_RUN_LOCK_MAX_TTL_SECONDS,
  PROPERTY_CERT_RUN_LOCK_TTL_SECONDS,
  lockDecision,
  parseLockValue,
} from "./propertyCertRunGuard.ts";

const SETTLE_MS = 300;

function nowIso(ms) {
  return new Date(ms).toISOString();
}

async function readLockRow(client) {
  try {
    const res = await client.entities.AppSetting.filter({ key: PROPERTY_CERT_RUN_LOCK_KEY }, "-created_date", 5);
    const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** Current lock state. Reports the raw record too, so a caller can audit or surface it. */
export async function propertyCertRunLockStatus(client) {
  const row = await readLockRow(client);
  const value = parseLockValue(row?.value);
  if (!value || value.active !== true) return { active: false, run_id: "", expires_at: "", owner: "", row_id: row?.id || null };
  const expired = !(Date.parse(String(value.expires_at || "")) > Date.now());
  return {
    active: !expired,
    expired,
    run_id: value.run_id || "",
    owner: value.owner || "",
    started_at: value.started_at || "",
    expires_at: value.expires_at || "",
    took_over_from: value.took_over_from || "",
    row_id: row?.id || null,
  };
}

/** Read just the stored lock value (used by the sweeper to protect an active run). */
export async function readPropertyCertRunLock(client) {
  const row = await readLockRow(client);
  return parseLockValue(row?.value);
}

/**
 * Acquire the single-run lock.
 *
 * Returns `{ acquired: false, status: "refused", active_run_id, expires_at }` when another run
 * is live, and `{ acquired: false, status: "race_lost" }` when the write-then-verify check shows
 * another acquirer won — in which case the caller must abort before doing any work.
 */
export async function acquirePropertyCertRunLock(client, runId, ownerEmail, ttlSeconds) {
  const ttl = Math.max(0, Math.min(Number(ttlSeconds ?? PROPERTY_CERT_RUN_LOCK_TTL_SECONDS) || 0, PROPERTY_CERT_RUN_LOCK_MAX_TTL_SECONDS));
  const nowMs = Date.now();
  const row = await readLockRow(client);
  const decision = lockDecision(parseLockValue(row?.value), nowMs, runId, ttl * 1000);

  if (decision.verdict === "refuse") {
    return {
      acquired: false,
      status: "refused",
      reason: decision.reason,
      active_run_id: decision.active_run_id || "",
      expires_at: decision.expires_at || "",
    };
  }

  const claimToken = `${runId}:${Math.random().toString(36).slice(2, 10)}`;
  const value = {
    run_id: runId,
    owner: String(ownerEmail || ""),
    claim_token: claimToken,
    active: true,
    started_at: nowIso(nowMs),
    heartbeat_at: nowIso(nowMs),
    expires_at: nowIso(nowMs + ttl * 1000),
    took_over_from: decision.verdict === "takeover" ? (decision.took_over_from || "") : "",
    previous_expires_at: decision.verdict === "takeover" ? (row?.expires_at || "") : "",
  };

  const stored = row
    ? await client.entities.AppSetting.update(row.id, { value: JSON.stringify(value) })
    : await client.entities.AppSetting.create({ key: PROPERTY_CERT_RUN_LOCK_KEY, value: JSON.stringify(value) });

  const verify = async () => {
    const fresh = await readLockRow(client);
    const v = parseLockValue(fresh?.value);
    return !!(v && v.active === true && v.claim_token === claimToken);
  };

  // Write, verify, let any near-simultaneous acquirer land, verify again.
  if (!(await verify())) {
    return { acquired: false, status: "race_lost", reason: "another acquirer replaced the lock", expires_at: value.expires_at };
  }
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  if (!(await verify())) {
    return { acquired: false, status: "race_lost", reason: "another acquirer replaced the lock during the settle window", expires_at: value.expires_at };
  }

  return {
    acquired: true,
    status: decision.verdict === "takeover" ? "taken_over" : decision.verdict === "renew" ? "renewed" : "acquired",
    run_id: runId,
    owner: value.owner,
    expires_at: value.expires_at,
    took_over_from: value.took_over_from || "",
    row_id: row?.id || stored?.id || null,
  };
}

/** Release the lock — only when this run is the holder. Idempotent. */
export async function releasePropertyCertRunLock(client, runId) {
  const row = await readLockRow(client);
  const value = parseLockValue(row?.value);
  if (!row || !value) return { released: false, status: "no_lock" };
  if (String(value.run_id || "") !== String(runId || "")) {
    return { released: false, status: "not_holder", holder: value.run_id || "" };
  }
  if (value.active !== true) return { released: false, status: "already_released", run_id: value.run_id };
  const released = { ...value, active: false, released_at: nowIso(Date.now()) };
  await client.entities.AppSetting.update(row.id, { value: JSON.stringify(released) });
  return { released: true, status: "released", run_id: value.run_id };
}

/**
 * Are there certification artifacts belonging to a DIFFERENT run?
 *
 * This is the data-level guard that backs the lock: a new run refuses to start while another
 * run's synthetic records exist, so it can never modify or clean up an active run's records.
 * Certification records only, and never customer data.
 */
export async function assertNoForeignPropertyCertArtifacts(client, ownRunId) {
  const own = String(ownRunId || "").toLowerCase();

  // A publication event or an inquiry carries no run marker of its own, so ownership is resolved
  // through the listing it hangs off. Cached per listing id, and only consulted for marker-less
  // rows, so the check stays to a handful of queries.
  const listingCache = new Map();
  const listingRun = async (listingId) => {
    if (!listingId) return null;
    if (listingCache.has(listingId)) return listingCache.get(listingId);
    let marker = null;
    try {
      const res = await client.entities.PropertyListing.filter({ listing_id: listingId }, "-created_date", 1);
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      marker = rows[0] ? String(rows[0].certification_run_id || rows[0].client_email || "") : null;
    } catch {
      marker = null;
    }
    listingCache.set(listingId, marker);
    return marker;
  };

  const probe = async (entityName) => {
    const api = client.entities?.[entityName];
    if (!api) return { entity: entityName, foreign: [], unattributed: 0, error: "entity unavailable" };
    try {
      const res = await api.filter({ certification_mode: true }, "-created_date", 50);
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      const foreign = [];
      let unattributed = 0;
      for (const row of rows) {
        const marker = String(row.certification_run_id || row.client_email || row.email || "").toLowerCase();
        if (marker) {
          if (!own || !marker.startsWith(own)) foreign.push({ id: row.id, entity: entityName, run: marker.slice(0, 60) });
          continue;
        }
        const viaListing = await listingRun(String(row.listing_id || ""));
        if (viaListing && (!own || !viaListing.toLowerCase().startsWith(own))) {
          foreign.push({ id: row.id, entity: entityName, run: viaListing.slice(0, 60), attributed_via: "listing" });
        } else if (!viaListing) {
          // Neither its own markers nor its listing identify a run: surfaced, never guessed at.
          unattributed++;
        }
      }
      return { entity: entityName, foreign, unattributed };
    } catch (e) {
      return { entity: entityName, foreign: [], unattributed: 0, error: String(e?.message || e) };
    }
  };

  const results = [
    await probe("PropertyListing"),
    await probe("PropertyListingEvent"),
    await probe("PropertyInquiry"),
  ];
  const foreign_count = results.reduce((n, r) => n + r.foreign.length, 0);
  const unattributed_count = results.reduce((n, r) => n + (r.unattributed || 0), 0);
  return { clear: foreign_count === 0, foreign_count, unattributed_count, by_entity: results, own_run_id: ownRunId };
}