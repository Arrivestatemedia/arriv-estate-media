/** Merges freshly read résumé facts into what the applicant already has, without overwriting edits. */

export function mergeExtract(current, incoming) {
  const keep = (existing, fresh) => {
    if (Array.isArray(existing)) return existing.length ? existing : fresh || [];
    return existing || fresh || "";
  };
  return {
    summary: keep(current?.summary, incoming?.summary),
    work_history: keep(current?.work_history, incoming?.work_history),
    education: keep(current?.education, incoming?.education),
    certifications: keep(current?.certifications, incoming?.certifications),
    skills: keep(current?.skills, incoming?.skills),
    uncertain_fields: incoming?.uncertain_fields || [],
  };
}

export function mergeContact(current, contact) {
  const fill = (existing, fresh) => (existing && existing.trim ? existing : fresh || "");
  return {
    ...current,
    full_name: fill(current.full_name, contact?.full_name),
    email: fill(current.email, contact?.email),
    phone: fill(current.phone, contact?.phone),
    address: fill(current.address, contact?.address),
    dob: fill(current.dob, contact?.dob),
    linkedin: fill(current.linkedin, contact?.linkedin),
  };
}

/** The required details that a résumé usually does not carry or that came back unclear. */
export function fieldsToConfirm(fields, uncertainFields = []) {
  const missing = [];
  if (!fields.full_name?.trim()) missing.push("Full name");
  if (!fields.email?.trim()) missing.push("Email address");
  if (!fields.phone?.trim()) missing.push("Phone number");
  if (!fields.address?.trim()) missing.push("Residential address");
  if (!fields.dob?.trim()) missing.push("Date of birth");
  if (!fields.last_related_job?.trim()) missing.push("Most recent related experience");
  uncertainFields.forEach((label) => missing.push(`${label} (needs confirmation)`));
  return missing;
}