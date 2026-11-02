// State scoping on the Job Board: a job is shown only to media partners in the
// job's own state. A job with no state recorded is not restricted.
export const normalizeUsState = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  const bare = raw.match(/^([A-Za-z]{2})$/);
  if (bare) return bare[1].toUpperCase();

  const inAddress = raw.match(/(?:^|,)\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  return inAddress ? inAddress[1].toUpperCase() : "";
};

// True when the partner may see a job in jobState. An unknown partner state does
// not grant access to a state-specific job.
export const jobMatchesPartnerState = (jobState, partnerState) => {
  const job = normalizeUsState(jobState);
  if (!job) return true;
  return normalizeUsState(partnerState) === job;
};