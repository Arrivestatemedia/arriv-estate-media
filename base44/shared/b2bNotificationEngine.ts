// ============================================================================
// B2B NOTIFICATION ENGINE
//
// Centralized notification system for B2B events.
// Uses existing communications infrastructure (Brevo email, SMS) where appropriate.
// ============================================================================

export type B2BNotificationType =
  | 'organization_provisioned'
  | 'company_admin_invitation'
  | 'team_member_invitation'
  | 'contract_signed'
  | 'annual_invoice_sent'
  | 'monthly_billing_enrollment'
  | 'payment_successful'
  | 'payment_failed'
  | 'past_due'
  | 'account_hold'
  | 'account_restored'
  | 'implementation_milestone'
  | 'go_live'
  | 'credit_usage_80'
  | 'credit_usage_100'
  | 'capacity_usage_80'
  | 'capacity_usage_100'
  | 'overage'
  | 'large_property_commercial_requirement'
  | 'renewal_120_days'
  | 'renewal_90_days'
  | 'renewal_60_days'
  | 'renewal_30_days'
  | 'expansion_completion';

export interface B2BNotification {
  type: B2BNotificationType;
  organization_id: string;
  organization_name: string;
  recipient_email: string;
  recipient_name?: string;
  recipient_phone?: string;
  subject: string;
  body: string;
  metadata?: Record<string, any>;
}

/**
 * Build a B2B notification object.
 * The actual sending is done by the backend function using Brevo/SMS.
 */
export function buildB2BNotification(
  type: B2BNotificationType,
  org: any,
  recipientEmail: string,
  recipientName?: string,
  metadata?: Record<string, any>
): B2BNotification {
  const orgName = org?.display_name || org?.legal_name || 'Your Organization';

  const templates: Record<B2BNotificationType, { subject: string; body: string }> = {
    organization_provisioned: {
      subject: `Welcome to Arriv Estate Media — ${orgName} is now provisioned`,
      body: `Your B2B organization has been successfully provisioned. Your implementation is now in progress.`,
    },
    company_admin_invitation: {
      subject: `You've been invited as a Company Admin for ${orgName}`,
      body: `You've been invited to manage ${orgName} on Arriv Estate Media. Please log in to accept your invitation.`,
    },
    team_member_invitation: {
      subject: `You've been invited to join ${orgName} on Arriv Estate Media`,
      body: `Your organization has invited you to join their Arriv Estate Media account. Please log in to accept.`,
    },
    contract_signed: {
      subject: `Contract Signed — ${orgName}`,
      body: `Your B2B contract has been signed and is now being processed.`,
    },
    annual_invoice_sent: {
      subject: `Annual Invoice — ${orgName}`,
      body: `Your annual prepaid invoice has been generated. Please review and submit payment to activate your account.`,
    },
    monthly_billing_enrollment: {
      subject: `Monthly Billing Enrolled — ${orgName}`,
      body: `Your monthly billing has been enrolled. You will be billed on the 1st of each month.`,
    },
    payment_successful: {
      subject: `Payment Received — ${orgName}`,
      body: `Your payment has been successfully processed. Thank you!`,
    },
    payment_failed: {
      subject: `Payment Failed — ${orgName}`,
      body: `Your recent payment attempt failed. Please update your payment method to avoid service interruption.`,
    },
    past_due: {
      subject: `Account Past Due — ${orgName}`,
      body: `Your account is past due. Please contact your sales representative to resolve this issue.`,
    },
    account_hold: {
      subject: `Account On Hold — ${orgName}`,
      body: `Your account is currently on hold. Please contact your sales representative for assistance.`,
    },
    account_restored: {
      subject: `Account Restored — ${orgName}`,
      body: `Your account has been restored. You may now resume booking and accessing your entitlements.`,
    },
    implementation_milestone: {
      subject: `Implementation Progress — ${orgName}`,
      body: `Your implementation has reached a new milestone.`,
    },
    go_live: {
      subject: `You're Live! — ${orgName}`,
      body: `Congratulations! Your B2B account is now live. You can start booking shoots using your entitlements.`,
    },
    credit_usage_80: {
      subject: `80% Credit Usage — ${orgName}`,
      body: `You've used 80% of your monthly Media Credits. You may want to consider an expansion.`,
    },
    credit_usage_100: {
      subject: `100% Credit Usage — ${orgName}`,
      body: `You've used all your monthly Media Credits. Additional bookings will require cash payment or an expansion.`,
    },
    capacity_usage_80: {
      subject: `80% Capacity Usage — ${orgName}`,
      body: `You've used 80% of your monthly Reserved Capacity. You may want to consider an expansion.`,
    },
    capacity_usage_100: {
      subject: `100% Capacity Usage — ${orgName}`,
      body: `You've used all your monthly Reserved Capacity. Additional bookings will incur overage charges.`,
    },
    overage: {
      subject: `Capacity Overage — ${orgName}`,
      body: `You've exceeded your contracted Reserved Capacity. Overage charges will apply.`,
    },
    large_property_commercial_requirement: {
      subject: `Commercial Review Required — Large Property`,
      body: `A property over 25,000 sqft requires a custom commercial quote. Please contact your sales representative.`,
    },
    renewal_120_days: {
      subject: `Renewal Coming Up — ${orgName} (120 days)`,
      body: `Your contract renewal is coming up in 120 days. Please contact your sales representative to discuss renewal options.`,
    },
    renewal_90_days: {
      subject: `Renewal Coming Up — ${orgName} (90 days)`,
      body: `Your contract renewal is coming up in 90 days. Please contact your sales representative to discuss renewal options.`,
    },
    renewal_60_days: {
      subject: `Renewal Coming Up — ${orgName} (60 days)`,
      body: `Your contract renewal is coming up in 60 days. Please contact your sales representative to discuss renewal options.`,
    },
    renewal_30_days: {
      subject: `Renewal Coming Up — ${orgName} (30 days)`,
      body: `Your contract renewal is coming up in 30 days. Please contact your sales representative to discuss renewal options.`,
    },
    expansion_completion: {
      subject: `Expansion Complete — ${orgName}`,
      body: `Your contract expansion has been completed. New entitlements are now available.`,
    },
  };

  const template = templates[type] || { subject: `B2B Notification — ${orgName}`, body: 'You have a new notification.' };

  return {
    type,
    organization_id: org?.id || '',
    organization_name: orgName,
    recipient_email: recipientEmail,
    recipient_name,
    subject: template.subject,
    body: template.body,
    metadata,
  };
}