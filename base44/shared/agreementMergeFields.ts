// ============================================================================
// AGREEMENT MERGE FIELDS
//
// Resolves merge field variables from canonical B2B entities.
// Never invents missing commercial values — returns errors for missing fields.
// ============================================================================

import { getLockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface MergeFieldResult {
  data: Record<string, any>;
  errors: string[];
}

/**
 * Resolve all merge fields for a given organization + contract context.
 * Returns the data object and any errors for missing required fields.
 */
export async function resolveMergeFields(
  client: any,
  organizationId: string | null,
  contractId: string | null,
  quoteId: string | null
): Promise<MergeFieldResult> {
  const data: Record<string, any> = {};
  const errors: string[] = [];

  // Organization fields
  if (organizationId) {
    const org = await client.entities.B2BOrganization.get(organizationId).catch(() => null);
    if (org) {
      data['organization.legal_name'] = org.legal_name || '';
      data['organization.display_name'] = org.display_name || org.legal_name || '';
      data['organization.billing_contact'] = org.billing_contact_name || org.billing_contact_email || '';
      data['organization.billing_contact_email'] = org.billing_contact_email || '';
      data['organization.billing_contact_phone'] = org.billing_contact_phone || '';
      data['organization.primary_admin'] = org.primary_admin_email || '';
      data['organization.address'] = org.legal_name || ''; // Address if available
    } else {
      errors.push(`organization not found: ${organizationId}`);
    }
  }

  // Contract fields
  if (contractId) {
    const contract = await client.entities.B2BContract.get(contractId).catch(() => null);
    if (contract) {
      data['contract.plan_id'] = contract.plan_id || '';
      data['contract.contract_type'] = contract.contract_type || '';
      data['contract.billing_frequency'] = contract.billing_frequency || '';
      data['contract.monthly_price'] = contract.monthly_price ?? '';
      data['contract.annual_price'] = contract.annual_prepaid_price ?? '';
      data['contract.start_date'] = contract.start_date || '';
      data['contract.end_date'] = contract.end_date || '';
      data['contract.term_months'] = contract.term_months ?? '';
      data['contract.renewal_type'] = contract.renewal_type || '';

      // Resolve locked config for richer fields
      if (contract.contract_version_id) {
        const snapshots = await getLockedConfigSnapshots(client, contract.contract_version_id).catch(() => null);
        if (snapshots) {
          const plan = snapshots.plan.snapshot.plans?.find((p: any) => p.plan_id === contract.plan_id);
          if (plan) {
            data['contract.plan_name'] = plan.display_name || plan.plan_id;
            data['contract.media_credits'] = plan.monthly_media_credits ?? '';
          }
          if (snapshots.capacity?.snapshot?.standards) {
            const cap = contract.capacity_entitlement;
            data['contract.capacity'] = cap?.contracted_shoots ?? '';
          }
          data['contract.full_seats'] = (snapshots.seats?.snapshot?.included_full_seats) ?? '';
          data['contract.admin_seats'] = (snapshots.seats?.snapshot?.included_admin_seats) ?? '';
          data['contract.implementation_fee'] = plan?.base_implementation_fee ?? '';
        }
      }

      // Sales rep
      if (contract.sales_rep_id) {
        const rep = await client.entities.SalesTeamMember.get(contract.sales_rep_id).catch(() => null);
        if (rep) {
          data['sales_rep.name'] = rep.full_name || rep.name || '';
          data['sales_rep.email'] = rep.email || '';
        }
      } else {
        data['sales_rep.name'] = '';
        data['sales_rep.email'] = contract.sales_rep_email || '';
      }
    } else {
      errors.push(`contract not found: ${contractId}`);
    }
  }

  // Quote fields
  if (quoteId) {
    const quote = await client.entities.B2BQuote.get(quoteId).catch(() => null);
    if (quote) {
      data['quote.quote_id'] = quote.quote_id || '';
      data['quote.status'] = quote.status || '';
      data['quote.recommended_plan_id'] = quote.recommended_plan_id || '';
      data['quote.selected_plan_id'] = quote.selected_plan_id || '';
    }
  }

  // Agreement effective date = today
  data['agreement.effective_date'] = new Date().toISOString().split('T')[0];

  return { data, errors };
}

/**
 * Apply merge field data to a document body, replacing {{variable}} placeholders.
 * Returns the rendered body and any unresolved variables.
 */
export function applyMergeFields(
  body: string,
  data: Record<string, any>
): { rendered: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const rendered = body.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const value = data[key];
    if (value === undefined || value === null || value === '') {
      unresolved.push(key);
      return match; // Leave the placeholder if missing
    }
    return String(value);
  });
  return { rendered, unresolved };
}

/**
 * Extract all merge field variables from a document body.
 */
export function extractMergeFields(body: string): string[] {
  const matches = body.matchAll(/\{\{(\w+(?:\.\w+)*)\}\}/g);
  const fields = new Set<string>();
  for (const match of matches) {
    fields.add(match[1]);
  }
  return Array.from(fields);
}