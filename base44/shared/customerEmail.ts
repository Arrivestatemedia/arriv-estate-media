// Use only with an email obtained from a verified server-side actor.
export function customerEmailQuery(field, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Verified customer email is required');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { [field]: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' } };
}