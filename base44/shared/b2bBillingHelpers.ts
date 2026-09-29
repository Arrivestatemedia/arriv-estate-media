// Shared B2B billing helpers — used by manageB2BBilling and syncB2BBilling
// Extracted to prevent code duplication across billing functions.

export async function applyHold(
  client: any,
  organizationId: string,
  contractId: string,
  reason: string,
  idempotencyKey: string
) {
  const org = await client.entities.B2BOrganization.get(organizationId);
  const contract = await client.entities.B2BContract.get(contractId);

  const beforeSnapshot = JSON.stringify({
    org_status: org?.contract_status,
    contract_status: contract?.status,
  });

  if (org) {
    await client.entities.B2BOrganization.update(organizationId, { contract_status: 'suspended' });
  }
  if (contract) {
    await client.entities.B2BContract.update(contractId, { status: 'suspended' });
  }

  await client.entities.B2BAuditLog.create({
    actor: 'arriv_payroll',
    actor_type: 'system',
    action: 'HOLD_APPLIED',
    reason,
    entity_type: 'B2BOrganization',
    entity_id: organizationId,
    before_snapshot: beforeSnapshot,
    after_snapshot: JSON.stringify({ org_status: 'suspended', contract_status: 'suspended' }),
    timestamp: new Date().toISOString(),
  });
}

export async function releaseHold(
  client: any,
  organizationId: string,
  contractId: string,
  reason: string,
  idempotencyKey: string
) {
  const org = await client.entities.B2BOrganization.get(organizationId);
  const contract = await client.entities.B2BContract.get(contractId);

  const beforeSnapshot = JSON.stringify({
    org_status: org?.contract_status,
    contract_status: contract?.status,
  });

  if (org) {
    await client.entities.B2BOrganization.update(organizationId, { contract_status: 'active' });
  }
  if (contract) {
    await client.entities.B2BContract.update(contractId, { status: 'active' });
  }

  await client.entities.B2BAuditLog.create({
    actor: 'arriv_payroll',
    actor_type: 'system',
    action: 'HOLD_RELEASED',
    reason,
    entity_type: 'B2BOrganization',
    entity_id: organizationId,
    before_snapshot: beforeSnapshot,
    after_snapshot: JSON.stringify({ org_status: 'active', contract_status: 'active' }),
    timestamp: new Date().toISOString(),
  });
}

export async function sendToPayroll(base44: any, eventType: string, payload: any) {
  const payrollEndpoint = Deno.env.get('ARRIV_PAYROLL_ENDPOINT');
  const payrollSecret = Deno.env.get('ARRIV_PAYROLL_API_SECRET');

  if (!payrollEndpoint || !payrollSecret) {
    throw new Error('Payroll endpoint not configured');
  }

  const response = await fetch(`${payrollEndpoint}/b2b/${eventType}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Arriv-Signature': await hmacSign(payrollSecret, JSON.stringify(payload)),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Payroll API error: ${response.status}`);
  }

  return await response.json();
}

export async function fetchPaymentStatusFromPayroll(contractId: string) {
  const endpoint = Deno.env.get('ARRIV_PAYROLL_ENDPOINT');
  const secret = Deno.env.get('ARRIV_PAYROLL_API_SECRET');
  if (!endpoint || !secret) return null;

  const response = await fetch(`${endpoint}/b2b/payment_status/${contractId}`, {
    headers: { 'X-Arriv-Signature': await hmacSign(secret, contractId) },
  });
  if (!response.ok) return null;
  return await response.json();
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}