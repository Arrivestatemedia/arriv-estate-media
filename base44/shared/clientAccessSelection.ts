/**
 * Client Property Access Selection — shared engine
 *
 * Handles the 24-hour-before-shoot access selection flow:
 *   1. Build the interactive access-request message (territory-aware).
 *   2. Apply a client's selection (on_site | lockbox) — marks the job and
 *      sends a confirmation SMS. The lockbox provider (Supra / Sentri) is
 *      resolved from the job's state at display time.
 *   3. Parse an inbound SMS body into a selection or a support request.
 *
 * Used by:
 *   - sendJobReminders (24h block) → builds + sends the request, sets the
 *     client_access_request_sent_at sentinel.
 *   - manageClientAccessSelection (web selection) → applies the selection.
 *   - twilioSmsWebhook (inbound SMS) → parses + applies the selection.
 */
import {
  PROVIDER_SENTRILOCK,
  PROVIDER_SUPRA,
  PROVIDER_UNKNOWN,
  getPropertyAccessProvider,
  getAccessGuideUrl,
} from './propertyAccessProvider.ts';

export const ACCESS_ON_SITE = 'on_site';
export const ACCESS_LOCKBOX = 'lockbox';
export const ACCESS_PENDING = 'pending';

/**
 * Human-readable label for the lockbox provider in client-facing copy.
 */
export function providerLabel(provider: string): string {
  if (provider === PROVIDER_SENTRILOCK) return 'Sentri';
  if (provider === PROVIDER_SUPRA) return 'Supra';
  return 'lockbox';
}

/**
 * The job-level display string for a recorded selection.
 *   on_site  → "The client will be on site"
 *   lockbox  → "The client has provided access through Sentri/Supra"
 */
export function accessSelectionDisplay(job: { client_access_selection?: string; state?: string }): string {
  const sel = job?.client_access_selection;
  if (sel === ACCESS_ON_SITE) return 'The client will be on site';
  if (sel === ACCESS_LOCKBOX) {
    const provider = getPropertyAccessProvider(job);
    return `The client has provided access through ${providerLabel(provider)}`;
  }
  return 'Access selection pending';
}

function specialistDisplayName(job: { booked_by_name?: string }): string {
  const raw = (job?.booked_by_name || '').trim();
  const parts = raw.split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return raw || 'your Media Specialist';
}

function appUrl(): string {
  return (Deno.env.get('BASE44_APP_DOMAIN') || 'https://arrivestatemedia.base44.app').replace(/\/+$/, '') + '/ClientBookings';
}

/**
 * Build the 24-hour interactive access-request SMS body for a job.
 */
export function buildAccessRequestSms(job: any, formattedDate: string, formattedTime: string): string {
  const provider = getPropertyAccessProvider(job);
  const label = providerLabel(provider);
  const firstName = (job.client_name || '').split(' ')[0] || 'there';
  const specialist = specialistDisplayName(job);
  const lockboxPhrase = provider === PROVIDER_UNKNOWN
    ? 'Grant lockbox access'
    : `Grant ${label} lockbox access`;

  return (
    `Hi ${firstName}! Your Arriv Estate Media shoot is tomorrow, ${formattedDate}, at ${formattedTime} at ${job.location}.\n\n` +
    `Your Media Specialist, ${specialist}, will be arriving. How will they access the property?\n\n` +
    `Reply:\n` +
    `1 = I'll be on site\n` +
    `2 = ${lockboxPhrase}\n\n` +
    `Or text "support: your message" to reach our team.\n` +
    `You can also choose here: ${appUrl()}\n\n` +
    `Arriv Estate Media`
  );
}

/**
 * Build the confirmation SMS sent immediately after the client selects.
 */
export function buildAccessConfirmationSms(job: any, selection: string): string {
  const provider = getPropertyAccessProvider(job);
  const guideUrl = getAccessGuideUrl(provider);
  const firstName = (job.client_name || '').split(' ')[0] || 'there';
  const specialistEmail = job.booked_by;
  const specialistPhone = job.booked_by_phone;

  if (selection === ACCESS_ON_SITE) {
    return (
      `Thanks, ${firstName}! We've noted that you'll be on site to let your Media Specialist in. ` +
      `See you at the shoot!\n\nArriv Estate Media`
    );
  }

  // lockbox
  if (provider === PROVIDER_SENTRILOCK) {
    return (
      `Thanks, ${firstName}! Please grant temporary SentriConnect access to ${specialistEmail} ` +
      `through your SentriKey Real Estate app.\n\n` +
      `Guide: ${guideUrl}\n\nArriv Estate Media`
    );
  }
  if (provider === PROVIDER_SUPRA) {
    return (
      `Thanks, ${firstName}! Please grant Supra access to ${specialistPhone}.\n\n` +
      `Guide: ${guideUrl}\n\nArriv Estate Media`
    );
  }
  return (
    `Thanks, ${firstName}! Please ensure your Media Specialist has authorized property access ` +
    `for the scheduled appointment.\n\nArriv Estate Media`
  );
}

/**
 * Parse an inbound SMS body into a selection or a support request.
 * Returns one of:
 *   { kind: 'selection', selection: 'on_site' | 'lockbox' }
 *   { kind: 'support', message: string }
 *   { kind: 'unknown' }
 */
export function parseAccessSms(body: string): { kind: string; selection?: string; message?: string } {
  const raw = (body || '').trim();
  const lower = raw.toLowerCase();

  // "support: {message}" → route to admin
  if (lower.startsWith('support:') || lower === 'support') {
    const message = raw.slice(lower === 'support' ? 7 : 7).trim();
    return { kind: 'support', message };
  }

  // Numeric / keyword selections
  if (lower === '1' || lower === 'on site' || lower === 'onsite' || lower.includes("i'll be on site") || lower.includes('i will be on site')) {
    return { kind: 'selection', selection: ACCESS_ON_SITE };
  }
  if (
    lower === '2' ||
    lower === 'lockbox' ||
    lower === 'lock box' ||
    lower === 'supra' ||
    lower === 'sentri' ||
    lower === 'sentrilock' ||
    lower.includes('grant') ||
    lower.includes('access')
  ) {
    return { kind: 'selection', selection: ACCESS_LOCKBOX };
  }

  return { kind: 'unknown' };
}

/**
 * Apply a client's access selection: mark the job and send the confirmation SMS.
 * Returns the display string.
 */
export async function applyClientAccessSelection(
  base44: any,
  job: any,
  selection: string,
  source: string,
): Promise<string> {
  const now = new Date().toISOString();

  await base44.asServiceRole.entities.Job.update(job.id, {
    client_access_selection: selection,
    client_access_selection_at: now,
    client_access_selection_source: source,
  });

  const display = accessSelectionDisplay({ client_access_selection: selection, state: job.state });

  // Send confirmation SMS to the client
  if (job.client_phone) {
    const message = buildAccessConfirmationSms(job, selection);
    try {
      await base44.asServiceRole.functions.invoke('sendReminderSMS', {
        phone: job.client_phone,
        message,
        recipientType: 'client',
        jobId: job.id,
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: message,
        job_id: job.id,
        subject: 'client_access_selection_confirmation',
        status: 'success',
      });
    } catch (e) {
      console.error('Access selection confirmation SMS failed:', e.message);
    }
  }

  return display;
}