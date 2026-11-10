import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { requireCustomer } from '../../shared/customerSession.ts';
import {
  listPurchasingContexts,
  evaluateOrganizationContext,
  ensureVerifiedMemberships,
} from '../../shared/customerPurchasingContext.ts';
import { validateSeatAvailability } from '../../shared/b2bSeatManager.ts';

/**
 * Customer-facing organization + purchasing-context service.
 *
 * - Every action requires a verified customer session (no body identity trusted).
 * - Member management requires an ACTIVE organization admin membership.
 * - It never creates logins: an invitation is a membership row that activates
 *   against the person's existing verified account on their next sign-in.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'list_contexts';

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ status: 'ERROR', error: auth.error }, { status: auth.status });
    }
    const account = auth.record;
    const db = base44.asServiceRole;

    if (action === 'list_contexts') {
      const contexts = await listPurchasingContexts(db, account);
      return Response.json({ status: 'OK', data: contexts });
    }

    if (action === 'authorize') {
      const organizationId = body?.organization_id || '';
      if (!organizationId) {
        return Response.json({
          status: 'OK',
          data: {
            type: 'personal',
            authorized: true,
            can_order: true,
            ordering_person_email: String(account.email || '').toLowerCase(),
            credit_source: 'personal',
          },
        });
      }
      await ensureVerifiedMemberships(db, account);
      const context = await evaluateOrganizationContext(db, {
        email: account.email,
        organization_id: organizationId,
      });
      return Response.json(
        { status: 'OK', data: context },
        { status: context.can_order ? 200 : 403 }
      );
    }

    // ── Everything below is organization administration ──────────────────────
    const organizationId = body?.organization_id || '';
    if (!organizationId) {
      return Response.json({ status: 'ERROR', error: 'organization_id is required' }, { status: 400 });
    }

    const memberships = await ensureVerifiedMemberships(db, account);
    const mine = memberships.find((m: any) => m.organization_id === organizationId);
    if (!mine || mine.status !== 'active') {
      return Response.json(
        { status: 'ERROR', error: 'You do not have access to this organization.', code: 'NOT_A_MEMBER' },
        { status: 403 }
      );
    }

    const isOrgAdmin = mine.role === 'admin';
    const org = await db.entities.B2BOrganization.get(organizationId).catch(() => null);
    if (!org) {
      return Response.json({ status: 'ERROR', error: 'Organization not found' }, { status: 404 });
    }

    const requireAdmin = () => {
      if (isOrgAdmin) return null;
      return Response.json(
        {
          status: 'ERROR',
          error: 'Only an organization administrator can manage company members.',
          code: 'ADMIN_REQUIRED',
        },
        { status: 403 }
      );
    };

    const seatEntitlement = async () => {
      const rows = await db.entities.B2BSeatEntitlement.filter({
        organization_id: organizationId,
        status: 'active',
      });
      return rows && rows[0] ? rows[0] : org.seat_counts || null;
    };

    const audit = async (action_name: string, reason: string, entityId: string) => {
      await db.entities.B2BAuditLog.create({
        actor: account.email,
        actor_type: 'customer_admin',
        action: action_name,
        reason,
        entity_type: 'B2BOrganizationMember',
        entity_id: entityId,
        timestamp: new Date().toISOString(),
      });
    };

    if (action === 'list_members') {
      const all = await db.entities.B2BOrganizationMember.filter({
        organization_id: organizationId,
      });
      // A company administrator sees the team. Everyone else sees only their own
      // membership — a member never gets a view into colleagues' standing.
      const visible = isOrgAdmin
        ? all
        : all.filter((m: any) => m.id === mine.id);
      return Response.json({
        status: 'OK',
        data: {
          is_admin: isOrgAdmin,
          my_role: mine.role,
          members: visible.map((m: any) => ({
            id: m.id,
            name: m.user_name || '',
            email: m.user_email,
            role: m.role,
            status: m.status,
            seat_type: m.seat_type || '',
            is_me: m.id === mine.id,
            can_order: m.status === 'active',
          })),
        },
      });
    }

    if (action === 'invite_member') {
      const denied = requireAdmin();
      if (denied) return denied;

      const email = String(body?.email || '').trim().toLowerCase();
      const name = String(body?.name || '').trim();
      const role = ['full', 'admin', 'booking_only'].includes(body?.role) ? body.role : 'full';
      if (!email || !email.includes('@')) {
        return Response.json({ status: 'ERROR', error: 'A valid email address is required.' }, { status: 400 });
      }

      const existing = await db.entities.B2BOrganizationMember.filter({
        organization_id: organizationId,
        user_email: email,
      });
      if (existing && existing.length > 0) {
        return Response.json(
          {
            status: 'ERROR',
            error: existing[0].status === 'active'
              ? 'This person is already on the company account.'
              : 'This person already has a membership. Reactivate it instead.',
            code: 'MEMBER_EXISTS',
          },
          { status: 400 }
        );
      }

      const seats = await seatEntitlement();
      const validation = await validateSeatAvailability(db, organizationId, seats, role);
      if (!validation.valid) {
        return Response.json(
          {
            status: 'ERROR',
            error:
              validation.reason === 'FULL_SEATS_EXHAUSTED'
                ? 'All full seats are in use. Purchase an additional seat before adding this person.'
                : validation.reason === 'ADMIN_SEATS_EXHAUSTED'
                ? 'All administrator seats are in use. Purchase an additional seat before adding this person.'
                : 'All booking-only seats are in use. Purchase an additional seat before adding this person.',
            code: validation.reason,
            data: validation,
          },
          { status: 409 }
        );
      }

      const member = await db.entities.B2BOrganizationMember.create({
        organization_id: organizationId,
        user_email: email,
        user_name: name,
        role,
        seat_type:
          role === 'admin' ? 'included_admin' : role === 'booking_only' ? 'booking_only' : 'included_full',
        status: 'invited',
        invited_by: account.email,
        invited_at: new Date().toISOString(),
      });

      await audit('MEMBER_INVITED', `Invited ${email} as ${role}`, member.id);

      return Response.json({
        status: 'OK',
        data: {
          member_id: member.id,
          note: 'They activate automatically with their existing account the next time they sign in.',
        },
      });
    }

    if (action === 'update_member_role') {
      const denied = requireAdmin();
      if (denied) return denied;

      const memberId = body?.member_id || '';
      if (!memberId) {
        return Response.json({ status: 'ERROR', error: 'member_id is required' }, { status: 400 });
      }
      const role = ['full', 'admin', 'booking_only'].includes(body?.role) ? body.role : null;
      if (!role) {
        return Response.json({ status: 'ERROR', error: 'A valid role is required.' }, { status: 400 });
      }

      const target = await db.entities.B2BOrganizationMember.get(memberId).catch(() => null);
      if (!target || target.organization_id !== organizationId) {
        return Response.json({ status: 'ERROR', error: 'Member not found' }, { status: 404 });
      }

      if (target.role === 'admin' && role !== 'admin') {
        const admins = await db.entities.B2BOrganizationMember.filter({
          organization_id: organizationId,
          role: 'admin',
          status: 'active',
        });
        if (admins.length <= 1) {
          return Response.json(
            {
              status: 'ERROR',
              error: 'A company account needs at least one administrator. Add another administrator first.',
              code: 'LAST_ADMIN',
            },
            { status: 409 }
          );
        }
      }

      if (role !== target.role) {
        const seats = await seatEntitlement();
        const validation = await validateSeatAvailability(db, organizationId, seats, role);
        if (!validation.valid && role !== 'booking_only') {
          return Response.json(
            { status: 'ERROR', error: 'No seat is available for that role.', code: validation.reason },
            { status: 409 }
          );
        }
      }

      await db.entities.B2BOrganizationMember.update(memberId, {
        role,
        seat_type:
          role === 'admin' ? 'included_admin' : role === 'booking_only' ? 'booking_only' : 'included_full',
      });
      await audit('MEMBER_ROLE_CHANGED', `${target.user_email} set to ${role}`, memberId);

      return Response.json({ status: 'OK' });
    }

    if (action === 'deactivate_member') {
      const denied = requireAdmin();
      if (denied) return denied;

      const memberId = body?.member_id || '';
      const target = await db.entities.B2BOrganizationMember.get(memberId).catch(() => null);
      if (!target || target.organization_id !== organizationId) {
        return Response.json({ status: 'ERROR', error: 'Member not found' }, { status: 404 });
      }

      if (target.role === 'admin' && target.status === 'active') {
        const admins = await db.entities.B2BOrganizationMember.filter({
          organization_id: organizationId,
          role: 'admin',
          status: 'active',
        });
        if (admins.length <= 1) {
          return Response.json(
            {
              status: 'ERROR',
              error: 'A company account needs at least one administrator. Add another administrator first.',
              code: 'LAST_ADMIN',
            },
            { status: 409 }
          );
        }
      }

      // Access ends immediately for future company orders. The person's own
      // account, bookings, invoices and galleries are untouched.
      await db.entities.B2BOrganizationMember.update(memberId, {
        status: 'deactivated',
        deactivated_at: new Date().toISOString(),
        deactivated_by: account.email,
        deactivation_reason: String(body?.reason || 'Removed by organization administrator'),
      });
      await audit('MEMBER_DEACTIVATED', `Removed ${target.user_email}`, memberId);

      return Response.json({ status: 'OK' });
    }

    if (action === 'reactivate_member') {
      const denied = requireAdmin();
      if (denied) return denied;

      const memberId = body?.member_id || '';
      const target = await db.entities.B2BOrganizationMember.get(memberId).catch(() => null);
      if (!target || target.organization_id !== organizationId) {
        return Response.json({ status: 'ERROR', error: 'Member not found' }, { status: 404 });
      }

      const seats = await seatEntitlement();
      const validation = await validateSeatAvailability(db, organizationId, seats, target.role);
      if (!validation.valid) {
        return Response.json(
          { status: 'ERROR', error: 'No seat is available to restore this member.', code: validation.reason },
          { status: 409 }
        );
      }

      await db.entities.B2BOrganizationMember.update(memberId, {
        status: 'active',
        activated_at: new Date().toISOString(),
      });
      await audit('MEMBER_REACTIVATED', `Restored ${target.user_email}`, memberId);

      return Response.json({ status: 'OK' });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});