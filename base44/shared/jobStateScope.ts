/**
 * State scoping for job offers.
 *
 * A job is offered only to media partners who are in the JOB'S OWN STATE: a shoot
 * in Winder, GA is never pushed to a partner in Maryland or Virginia. Nothing here
 * guesses — a partner whose state cannot be determined is NOT treated as local, so
 * they are not notified about out-of-state work.
 *
 * A job with no state recorded (legacy rows) is not restricted, so existing
 * behaviour is preserved where there is nothing to scope by.
 */

const normalizeStateCode = (value: unknown): string => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  // Bare code: "GA"
  const bare = raw.match(/^([A-Za-z]{2})$/);
  if (bare) return bare[1].toUpperCase();

  // Address with a trailing state: "Winder, GA", "Arlington, VA 22204"
  const inAddress = raw.match(/(?:^|,)\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (inAddress) return inAddress[1].toUpperCase();

  return '';
};

/** The partner's own state: stored state first, then their coverage or city. */
export const partnerStateCode = (partner: any): string =>
  normalizeStateCode(partner?.state) ||
  normalizeStateCode(partner?.coverage_area) ||
  normalizeStateCode(partner?.city);

/** True when this partner may be offered a job in `jobState`. */
export const isJobInPartnerState = (partner: any, jobState: unknown): boolean => {
  const job = normalizeStateCode(jobState);
  if (!job) return true;
  return partnerStateCode(partner) === job;
};