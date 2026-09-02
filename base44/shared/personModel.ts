/**
 * Person Model — Canonical identity resolution for the Arriv ecosystem.
 *
 * A Person is the canonical identity that links role-specific records:
 *   Person → Employee (SalesTeamMember)
 *   Person → Customer (Contact)
 *   Person → Candidate (HireCandidate)
 *   Person → Partner (User with user_type=media_partner)
 *   Person → Applicant (JobApplication)
 *
 * A person may hold multiple roles simultaneously. This module provides
 * the resolution logic to find or create a Person from any role record,
 * and to link role records to an existing Person.
 *
 * This is the SINGLE SOURCE OF TRUTH for person resolution — used by
 * backend functions across Estate Media. Do not duplicate this logic.
 */

export const ROLE_TYPES = {
  EMPLOYEE: "employee",
  CUSTOMER: "customer",
  CANDIDATE: "candidate",
  PARTNER: "partner",
  APPLICANT: "applicant",
  MEDIA_SPECIALIST: "media_specialist",
};

/**
 * Normalize an email for matching (lowercase, trimmed).
 */
export function normalizeEmail(email) {
  return (email || "").toLowerCase().trim();
}

/**
 * Generate a stable shared_person_id if one doesn't exist.
 * Uses crypto.randomUUID() when available, falls back to timestamp-based.
 */
export function generateSharedPersonId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `per_${crypto.randomUUID()}`;
  }
  return `per_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Find an existing Person by email.
 * Returns the Person record or null.
 */
export async function findPersonByEmail(base44, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const results = await base44.entities.Person.filter({ email: normalized });
  return results && results[0] ? results[0] : null;
}

/**
 * Find an existing Person by shared_person_id.
 */
export async function findPersonBySharedId(base44, sharedPersonId) {
  if (!sharedPersonId) return null;
  const results = await base44.entities.Person.filter({ shared_person_id: sharedPersonId });
  return results && results[0] ? results[0] : null;
}

/**
 * Create a new Person record from identity fields.
 */
export async function createPerson(base44, { full_name, email, phone, dob, shared_person_id }) {
  const normalized = normalizeEmail(email);
  const person = await base44.entities.Person.create({
    full_name: full_name || "",
    email: normalized,
    phone: phone || "",
    dob: dob || undefined,
    shared_person_id: shared_person_id || generateSharedPersonId(),
    roles: [],
    status: "active",
  });
  return person;
}

/**
 * Link a role record to a Person. If the Person doesn't exist yet,
 * create it first from the role record's identity fields.
 *
 * @param {object} base44 - The base44 client (service role or user)
 * @param {string} roleType - One of ROLE_TYPES
 * @param {object} roleRecord - The role-specific record (e.g. SalesTeamMember, Contact)
 * @param {object} identityFields - { full_name, email, phone, dob } extracted from the role record
 * @param {string|null} existingSharedPersonId - If the role record already has a shared_person_id
 * @returns {Promise<object>} The Person record (found or created)
 */
export async function linkRoleToPerson(
  base44,
  roleType,
  roleRecord,
  identityFields,
  existingSharedPersonId = null
) {
  const { full_name, email, phone, dob } = identityFields;
  const normalized = normalizeEmail(email);

  if (!normalized) {
    throw new Error("Cannot link role to Person: email is required");
  }

  // 1. Try to find by shared_person_id if provided
  let person = null;
  if (existingSharedPersonId) {
    person = await findPersonBySharedId(base44, existingSharedPersonId);
  }

  // 2. Try to find by email
  if (!person) {
    person = await findPersonByEmail(base44, normalized);
  }

  // 3. Create if not found
  if (!person) {
    person = await createPerson(base44, {
      full_name,
      email: normalized,
      phone,
      dob,
      shared_person_id: existingSharedPersonId || generateSharedPersonId(),
    });
  }

  // 4. Check if this role is already linked
  const existingRole = (person.roles || []).find(
    (r) => r.role_type === roleType && r.record_id === roleRecord.id
  );

  if (!existingRole) {
    // 5. Add the role link
    const updatedRoles = [
      ...(person.roles || []),
      {
        role_type: roleType,
        record_id: roleRecord.id,
        record_type: roleRecord.constructor?.entityName || roleType,
        is_active: true,
        assumed_at: new Date().toISOString(),
      },
    ];

    person = await base44.entities.Person.update(person.id, {
      roles: updatedRoles,
      // Update identity fields if the Person was missing them
      phone: person.phone || phone || "",
      full_name: person.full_name || full_name || "",
    });
  }

  return person;
}

/**
 * Resolve a Person from an email address. Finds existing Person or returns null.
 * Does NOT create a new Person — use linkRoleToPerson for that.
 *
 * @returns {Promise<object|null>} The Person with all roles, or null
 */
export async function resolvePerson(base44, email) {
  const person = await findPersonByEmail(base44, email);
  return person;
}

/**
 * Get all roles for a Person, enriched with the actual role records.
 * Returns an object keyed by role_type with the role records.
 */
export async function getPersonRoles(base44, person) {
  if (!person || !person.roles || person.roles.length === 0) {
    return {};
  }

  const entityMap = {
    employee: "SalesTeamMember",
    customer: "Contact",
    candidate: "HireCandidate",
    applicant: "JobApplication",
    partner: "User",
    media_specialist: "User",
  };

  const roles = {};
  for (const roleLink of person.roles) {
    if (!roleLink.is_active) continue;
    const entityName = entityMap[roleLink.role_type];
    if (!entityName || !roleLink.record_id) continue;
    try {
      const record = await base44.entities[entityName].get(roleLink.record_id);
      if (record) {
        if (!roles[roleLink.role_type]) roles[roleLink.role_type] = [];
        roles[roleLink.role_type].push(record);
      }
    } catch (_) {
      // Record may have been deleted — skip
    }
  }

  return roles;
}

/**
 * Extract identity fields from a role record.
 * Each role record type stores identity differently — this normalizes it.
 */
export function extractIdentity(roleType, record) {
  switch (roleType) {
    case ROLE_TYPES.EMPLOYEE:
      return {
        full_name: record.full_name || "",
        email: record.email || record.personal_email || "",
        phone: record.phone_number || record.mobile_phone_number || "",
        dob: undefined,
      };
    case ROLE_TYPES.CUSTOMER:
      return {
        full_name: `${record.firstname || ""} ${record.lastname || ""}`.trim(),
        email: record.email || "",
        phone: record.phone || "",
        dob: undefined,
      };
    case ROLE_TYPES.CANDIDATE:
      return {
        full_name: record.name || "",
        email: record.email || "",
        phone: record.phone || "",
        dob: record.dob || undefined,
      };
    case ROLE_TYPES.APPLICANT:
      return {
        full_name: record.full_name || "",
        email: record.email || "",
        phone: record.phone || "",
        dob: record.dob || undefined,
      };
    case ROLE_TYPES.PARTNER:
      return {
        full_name: record.full_name || "",
        email: record.email || "",
        phone: record.phone || "",
        dob: undefined,
      };
    case ROLE_TYPES.MEDIA_SPECIALIST:
      return {
        full_name: record.full_name || "",
        email: record.email || "",
        phone: record.phone || "",
        dob: undefined,
      };
    default:
      return {
        full_name: record.full_name || record.name || "",
        email: record.email || "",
        phone: record.phone || "",
        dob: record.dob || undefined,
      };
  }
}