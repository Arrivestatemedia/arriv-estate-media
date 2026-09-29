// ============================================================================
// AGREEMENT STATE MACHINE
//
// Manages valid state transitions for agreements and recipients.
// ============================================================================

export const AGREEMENT_STATES = {
  DRAFT: 'DRAFT',
  PREPARING: 'PREPARING',
  READY_TO_SEND: 'READY_TO_SEND',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  OPENED: 'OPENED',
  VIEWING: 'VIEWING',
  SIGNING: 'SIGNING',
  PARTIALLY_SIGNED: 'PARTIALLY_SIGNED',
  COMPLETED: 'COMPLETED',
  DECLINED: 'DECLINED',
  VOIDED: 'VOIDED',
  EXPIRED: 'EXPIRED',
} as const;

export const RECIPIENT_STATES = {
  PENDING: 'PENDING',
  NOTIFIED: 'NOTIFIED',
  DELIVERED: 'DELIVERED',
  OPENED: 'OPENED',
  VIEWING: 'VIEWING',
  SIGNING: 'SIGNING',
  SIGNED: 'SIGNED',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;

const AGREEMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PREPARING', 'READY_TO_SEND', 'VOIDED'],
  PREPARING: ['READY_TO_SEND', 'DRAFT', 'VOIDED'],
  READY_TO_SEND: ['SENT', 'DRAFT', 'VOIDED'],
  SENT: ['DELIVERED', 'OPENED', 'VIEWING', 'SIGNING', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
  DELIVERED: ['OPENED', 'VIEWING', 'SIGNING', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
  OPENED: ['VIEWING', 'SIGNING', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
  VIEWING: ['SIGNING', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED', 'OPENED'],
  SIGNING: ['PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'],
  PARTIALLY_SIGNED: ['COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED', 'SIGNING'],
  COMPLETED: [], // Terminal
  DECLINED: [], // Terminal
  VOIDED: [], // Terminal
  EXPIRED: [], // Terminal
};

const RECIPIENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['NOTIFIED', 'DECLINED', 'EXPIRED'],
  NOTIFIED: ['DELIVERED', 'OPENED', 'VIEWING', 'SIGNING', 'DECLINED', 'EXPIRED'],
  DELIVERED: ['OPENED', 'VIEWING', 'SIGNING', 'DECLINED', 'EXPIRED'],
  OPENED: ['VIEWING', 'SIGNING', 'DECLINED', 'EXPIRED'],
  VIEWING: ['SIGNING', 'OPENED', 'DECLINED', 'EXPIRED'],
  SIGNING: ['SIGNED', 'APPROVED', 'COMPLETED', 'DECLINED', 'EXPIRED'],
  SIGNED: ['COMPLETED'],
  APPROVED: ['COMPLETED'],
  COMPLETED: [], // Terminal
  DECLINED: [], // Terminal
  EXPIRED: [], // Terminal
};

export function canTransitionAgreement(from: string, to: string): boolean {
  const allowed = AGREEMENT_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export function canTransitionRecipient(from: string, to: string): boolean {
  const allowed = RECIPIENT_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Determine the aggregate agreement status based on recipient states.
 */
export function computeAgreementStatus(recipients: any[]): string {
  const required = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
  if (required.length === 0) return AGREEMENT_STATES.DRAFT;

  const allCompleted = required.every(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');
  if (allCompleted) return AGREEMENT_STATES.COMPLETED;

  const anyDeclined = required.some(r => r.status === 'DECLINED');
  if (anyDeclined) return AGREEMENT_STATES.DECLINED;

  const anySigning = required.some(r => r.status === 'SIGNING');
  const someCompleted = required.some(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');
  if (anySigning && someCompleted) return AGREEMENT_STATES.PARTIALLY_SIGNED;
  if (anySigning) return AGREEMENT_STATES.SIGNING;

  const anyViewing = required.some(r => r.status === 'VIEWING');
  if (anyViewing) return AGREEMENT_STATES.VIEWING;

  const anyOpened = required.some(r => r.status === 'OPENED' || r.status === 'DELIVERED');
  if (anyOpened) return AGREEMENT_STATES.OPENED;

  const allNotified = required.every(r => r.status !== 'PENDING');
  if (allNotified) return AGREEMENT_STATES.SENT;

  return AGREEMENT_STATES.DRAFT;
}

/**
 * Check if an agreement status is terminal (no further transitions).
 */
export function isTerminal(status: string): boolean {
  return ['COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'].includes(status);
}