// ============================================================================
// B2B SEAT MANAGER
//
// Manages organization seats: included vs additional, seat limits,
// member assignment, and seat economics.
//
// Seat types:
//   - included_full: Full seats included in plan
//   - included_admin: Admin seats included in plan
//   - additional_full: Additional full seats ($10/month)
//   - additional_admin: Additional admin seats ($10/month)
//   - booking_only: Booking-only seats ($4/month)
//
// If a company admin exceeds purchased seat entitlement, the system does NOT
// silently grant free capacity — it routes to approved additional-seat
// purchase/expansion behavior.
// ============================================================================

import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface SeatCounts {
  included_full_seats: number;
  included_admin_seats: number;
  additional_full_seats: number;
  additional_admin_seats: number;
  booking_only_seats: number;
}

export interface SeatUsage {
  active_full: number;
  active_admin: number;
  active_booking_only: number;
  total_active: number;
}

export interface SeatValidationResult {
  valid: boolean;
  reason: string;
  exceeds_included: boolean;
  additional_full_needed: number;
  additional_admin_needed: number;
  additional_booking_only_needed: number;
}

/**
 * Get the total seat limits for an organization based on its seat entitlement.
 */
export function getSeatLimits(seatEntitlement: any): SeatCounts {
  return {
    included_full_seats: seatEntitlement?.included_full_seats || 0,
    included_admin_seats: seatEntitlement?.included_admin_seats || 0,
    additional_full_seats: seatEntitlement?.additional_full_seats || 0,
    additional_admin_seats: seatEntitlement?.additional_admin_seats || 0,
    booking_only_seats: seatEntitlement?.booking_only_seats || 0,
  };
}

/**
 * Get current seat usage from active organization members.
 */
export async function getSeatUsage(client: any, organizationId: string): Promise<SeatUsage> {
  const members = await client.entities.B2BOrganizationMember.filter({
    organization_id: organizationId,
    status: 'active',
  });

  let activeFull = 0;
  let activeAdmin = 0;
  let activeBookingOnly = 0;

  for (const m of members) {
    if (m.role === 'admin') activeAdmin++;
    else if (m.role === 'booking_only') activeBookingOnly++;
    else activeFull++;
  }

  return {
    active_full: activeFull,
    active_admin: activeAdmin,
    active_booking_only: activeBookingOnly,
    total_active: activeFull + activeAdmin + activeBookingOnly,
  };
}

/**
 * Validate whether a new member can be added given current seat limits.
 */
export async function validateSeatAvailability(
  client: any,
  organizationId: string,
  seatEntitlement: any,
  requestedRole: 'full' | 'admin' | 'booking_only'
): Promise<SeatValidationResult> {
  const limits = getSeatLimits(seatEntitlement);
  const usage = await getSeatUsage(client, organizationId);

  const totalFullLimit = limits.included_full_seats + limits.additional_full_seats;
  const totalAdminLimit = limits.included_admin_seats + limits.additional_admin_seats;
  const totalBookingOnlyLimit = limits.booking_only_seats;

  if (requestedRole === 'admin') {
    const available = totalAdminLimit - usage.active_admin;
    if (available > 0) {
      return { valid: true, reason: 'OK', exceeds_included: usage.active_admin >= limits.included_admin_seats, additional_full_needed: 0, additional_admin_needed: Math.max(0, usage.active_admin + 1 - limits.included_admin_seats), additional_booking_only_needed: 0 };
    }
    return { valid: false, reason: 'ADMIN_SEATS_EXHAUSTED', exceeds_included: true, additional_full_needed: 0, additional_admin_needed: usage.active_admin + 1 - limits.included_admin_seats, additional_booking_only_needed: 0 };
  }

  if (requestedRole === 'booking_only') {
    const available = totalBookingOnlyLimit - usage.active_booking_only;
    if (available > 0) {
      return { valid: true, reason: 'OK', exceeds_included: false, additional_full_needed: 0, additional_admin_needed: 0, additional_booking_only_needed: Math.max(0, usage.active_booking_only + 1 - 0) };
    }
    return { valid: false, reason: 'BOOKING_ONLY_SEATS_EXHAUSTED', exceeds_included: true, additional_full_needed: 0, additional_admin_needed: 0, additional_booking_only_needed: usage.active_booking_only + 1 };
  }

  // Full seat
  const available = totalFullLimit - usage.active_full;
  if (available > 0) {
    return { valid: true, reason: 'OK', exceeds_included: usage.active_full >= limits.included_full_seats, additional_full_needed: Math.max(0, usage.active_full + 1 - limits.included_full_seats), additional_admin_needed: 0, additional_booking_only_needed: 0 };
  }
  return { valid: false, reason: 'FULL_SEATS_EXHAUSTED', exceeds_included: true, additional_full_needed: usage.active_full + 1 - limits.included_full_seats, additional_admin_needed: 0, additional_booking_only_needed: 0 };
}

/**
 * Calculate monthly seat charges for an organization.
 */
export function calculateMonthlySeatCharges(
  seatEntitlement: any,
  lockedSnapshots: LockedConfigSnapshots
): number {
  const seatConfig = lockedSnapshots.seats.snapshot;
  const additional = (seatEntitlement?.additional_full_seats || 0) * seatConfig.additional_full_seat_monthly;
  const additionalAdmin = (seatEntitlement?.additional_admin_seats || 0) * seatConfig.additional_admin_seat_monthly;
  const bookingOnly = (seatEntitlement?.booking_only_seats || 0) * seatConfig.booking_only_seat_monthly;
  return Math.round((additional + additionalAdmin + bookingOnly) * 100) / 100;
}