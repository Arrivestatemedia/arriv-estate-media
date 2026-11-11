/**
 * Complimentary Preferred memberships (server-side only).
 *
 * AppSetting `preferred_comp_emails` holds the verified addresses that may activate a
 * Preferred membership without a payment. The list lives in the database, never in the
 * browser, and the address checked against it always comes from the signed customer
 * session — so a customer cannot add themselves, and editing local storage does nothing.
 *
 * A complimentary membership is a real membership record: it unlocks the same portal, and
 * it ends on its own `current_period_end` like any other. It records billing_source 'comp'
 * and a monthly_price of 0, so it can never be mistaken for revenue or pay a sales residual.
 */

export const COMP_EMAILS_KEY = 'preferred_comp_emails';
export const COMP_TERM_DAYS = 365;

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function settingValue(record: any): any {
  const raw = record?.value;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return raw;
  const text = raw.trim();
  if (!/^[[{]/.test(text)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function readCompedEmails(base44: any): Promise<string[]> {
  try {
    const found = rowsOf(await base44.asServiceRole.entities.AppSetting.filter({ key: COMP_EMAILS_KEY }));
    for (const record of found) {
      const value = settingValue(record);
      const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
      const emails = list.map((item: any) => String(item || '').trim().toLowerCase()).filter(Boolean);
      if (emails.length) return emails;
    }
  } catch {
    // A settings read failure grants nothing.
  }
  return [];
}

export async function isCompedEmail(base44: any, email: string): Promise<boolean> {
  const address = String(email || '').trim().toLowerCase();
  if (!address) return false;
  return (await readCompedEmails(base44)).includes(address);
}

export function compPeriod(now = Date.now()) {
  const start = new Date(now);
  const end = new Date(now + COMP_TERM_DAYS * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}