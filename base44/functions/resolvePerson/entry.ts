import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  findPersonByEmail,
  createPerson,
  linkRoleToPerson,
  getPersonRoles,
  extractIdentity,
  ROLE_TYPES,
  normalizeEmail,
} from '../../shared/personModel.ts';

/**
 * resolvePerson — Canonical person resolution for the Arriv ecosystem.
 *
 * Given an email (and optionally a role record to link), finds or creates
 * the canonical Person record and returns it with all linked roles.
 *
 * This is the single entry point for person resolution — used by the
 * HireHandoff, Customer360, and any feature that needs to unify a person's
 * identity across Employee/Customer/Candidate/Partner roles.
 *
 * Payload:
 *   email: string (required) — the person's email
 *   linkRole: { roleType, recordId, record } (optional) — link a role record
 *   includeRoles: boolean (optional, default true) — include enriched role records
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const email = normalizeEmail(body?.email);
    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400 });
    }

    // Use service role for Person operations (admin-only entity)
    const admin = base44.asServiceRole;

    // 1. Find existing Person
    let person = await findPersonByEmail(admin, email);

    // 2. If a role link is requested, link it
    if (body?.linkRole?.roleType && body?.linkRole?.recordId) {
      const { roleType, recordId, record } = body.linkRole;
      const identityFields = record
        ? extractIdentity(roleType, record)
        : { email, full_name: body.full_name || '', phone: body.phone || '' };

      // Build a minimal role record for linking — always ensure id is set
      // so the idempotency check in linkRoleToPerson works correctly.
      const roleRecord = { ...(record || {}), id: record?.id || recordId };

      person = await linkRoleToPerson(admin, roleType, roleRecord, identityFields);
    }

    // 3. Create if still not found and createIfMissing is true
    if (!person && body?.createIfMissing) {
      person = await createPerson(admin, {
        full_name: body.full_name || '',
        email,
        phone: body.phone || '',
        dob: body.dob || undefined,
        shared_person_id: body.shared_person_id || undefined,
      });
    }

    if (!person) {
      return Response.json({
        found: false,
        person: null,
        roles: {},
      });
    }

    // 4. Enrich with role records if requested
    let roles = {};
    if (body?.includeRoles !== false) {
      roles = await getPersonRoles(admin, person);
    }

    return Response.json({
      found: true,
      person,
      roles,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}