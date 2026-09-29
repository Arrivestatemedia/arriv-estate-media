import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { validateSeatAvailability, calculateMonthlySeatCharges } from '../../shared/b2bSeatManager.ts';
import { buildLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, organization_id, member_email, member_name, member_user_id, role, actor } = await req.json();

    if (action === 'invite') {
      const seatEntitlements = await base44.asServiceRole.entities.B2BSeatEntitlement.filter({
        organization_id, status: 'active',
      });
      const seatEntitlement = seatEntitlements[0];
      if (!seatEntitlement) return Response.json({ status: 'ERROR', error: 'No active seat entitlement' }, { status: 400 });

      const validation = await validateSeatAvailability(base44.asServiceRole, organization_id, seatEntitlement, role || 'full');
      if (!validation.valid) {
        return Response.json({ status: 'ERROR', error: validation.reason, data: validation }, { status: 400 });
      }

      const existing = await base44.asServiceRole.entities.B2BOrganizationMember.filter({
        organization_id, user_email: member_email,
      });
      if (existing.length > 0) {
        if (existing[0].status === 'deactivated') {
          await base44.asServiceRole.entities.B2BOrganizationMember.update(existing[0].id, {
            status: 'active',
            role: role || existing[0].role,
            activated_at: new Date().toISOString(),
          });
          return Response.json({ status: 'OK', data: { member_id: existing[0].id, reactivated: true } });
        }
        return Response.json({ status: 'ERROR', error: 'Member already exists' }, { status: 400 });
      }

      const member = await base44.asServiceRole.entities.B2BOrganizationMember.create({
        organization_id,
        user_id: member_user_id || '',
        user_email: member_email,
        user_name: member_name || '',
        role: role || 'full',
        seat_type: role === 'admin' ? 'included_admin' : role === 'booking_only' ? 'booking_only' : 'included_full',
        status: member_user_id ? 'active' : 'invited',
        invited_by: actor || 'system',
        invited_at: new Date().toISOString(),
      });

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'MEMBER_INVITED',
        reason: `Invited ${member_email} as ${role}`,
        entity_type: 'B2BOrganizationMember',
        entity_id: member.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: { member_id: member.id } });
    }

    if (action === 'deactivate') {
      const members = await base44.asServiceRole.entities.B2BOrganizationMember.filter({
        organization_id, user_email: member_email,
      });
      if (members.length === 0) return Response.json({ status: 'ERROR', error: 'Member not found' }, { status: 404 });

      await base44.asServiceRole.entities.B2BOrganizationMember.update(members[0].id, {
        status: 'deactivated',
        deactivated_at: new Date().toISOString(),
        deactivated_by: actor || 'system',
      });

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'MEMBER_DEACTIVATED',
        reason: `Deactivated ${member_email}`,
        entity_type: 'B2BOrganizationMember',
        entity_id: members[0].id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK' });
    }

    if (action === 'update_seats') {
      const { additional_full_seats, additional_admin_seats, booking_only_seats } = await req.json();
      const seatEntitlements = await base44.asServiceRole.entities.B2BSeatEntitlement.filter({
        organization_id, status: 'active',
      });
      if (seatEntitlements.length === 0) return Response.json({ status: 'ERROR', error: 'No active seat entitlement' }, { status: 400 });

      const se = seatEntitlements[0];
      const newAddFull = additional_full_seats ?? (se.additional_full_seats || 0);
      const newAddAdmin = additional_admin_seats ?? (se.additional_admin_seats || 0);
      const newBookingOnly = booking_only_seats ?? (se.booking_only_seats || 0);

      await base44.asServiceRole.entities.B2BSeatEntitlement.update(se.id, {
        additional_full_seats: newAddFull,
        additional_admin_seats: newAddAdmin,
        booking_only_seats: newBookingOnly,
        total_full_seats: (se.included_full_seats || 0) + newAddFull,
        total_admin_seats: (se.included_admin_seats || 0) + newAddAdmin,
      });

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'SEATS_UPDATED',
        reason: 'Updated seat counts',
        entity_type: 'B2BSeatEntitlement',
        entity_id: se.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK' });
    }

    if (action === 'get_usage') {
      const seatEntitlements = await base44.asServiceRole.entities.B2BSeatEntitlement.filter({
        organization_id, status: 'active',
      });
      const lockedSnapshots = await buildLockedConfigSnapshots(base44.asServiceRole);
      const monthlyCharges = seatEntitlements.length > 0
        ? calculateMonthlySeatCharges(seatEntitlements[0], lockedSnapshots)
        : 0;

      const members = await base44.asServiceRole.entities.B2BOrganizationMember.filter({
        organization_id, status: 'active',
      });

      return Response.json({
        status: 'OK',
        data: {
          seat_entitlement: seatEntitlements[0] || null,
          active_members: members.length,
          monthly_seat_charges: monthlyCharges,
          members,
        },
      });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});