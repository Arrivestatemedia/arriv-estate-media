// Phone number detection and formatting utilities.
// Used to prevent personal phone numbers from being relayed through
// the company SMS bridge between clients and media specialists.

const DIGIT_WORDS: Record<string, string> = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0'
};

/** Normalize any phone string to a 10-digit US number (strip leading 1). */
export function normalizePhoneNumber(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(-10);
}

/** Format for display: (404) 203-1234 */
export function formatPhoneDisplay(phone: string): string {
  const d = normalizePhoneNumber(phone);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone || '';
}

/** Convert to E.164 for Twilio: +14042031234 */
export function toE164(phone: string): string {
  if (!phone) return '';
  return phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
}

/**
 * Extract sequences of consecutive word-digits separated only by
 * spaces or hyphens (e.g. "four zero four", "four-zero-four").
 * Returns an array of digit strings.
 */
function extractWordDigitSequences(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const wordAlt = 'zero|one|two|three|four|five|six|seven|eight|nine|oh';
  const fullPattern = new RegExp(`\\b(${wordAlt})(?:[-\\s]+(${wordAlt}))+\\b`, 'g');
  const matches = lower.match(fullPattern) || [];
  const wordReplace = new RegExp(`\\b(${wordAlt})\\b`, 'g');
  return matches.map((m) =>
    m
      .replace(wordReplace, (match: string) => DIGIT_WORDS[match] || match)
      .replace(/\D/g, '')
  );
}

/**
 * Check if any subsequence of phoneDigits (length >= minLen) appears
 * inside messageDigits.
 */
function hasSubsequence(phoneDigits: string, messageDigits: string, minLen: number): boolean {
  for (let len = phoneDigits.length; len >= minLen; len--) {
    for (let i = 0; i <= phoneDigits.length - len; i++) {
      if (messageDigits.includes(phoneDigits.slice(i, i + len))) return true;
    }
  }
  return false;
}

/**
 * Check if the sender's personal phone number appears in the message body.
 *
 * Detects:
 *  - Digit format: "404-203-1234", "4042031234", "(404) 203-1234"
 *  - Word format:  "four zero four", "four-zero-four",
 *                  "four zero four two zero three"
 *  - Hyphenated word form: "four-zero-four-two-zero-three"
 *
 * Digit format requires 6+ consecutive matching digits to avoid false
 * positives. Word format requires 3+ consecutive matching digits (since
 * spelled-out digit sequences are almost always intentional).
 */
export function containsPersonalPhoneNumber(senderPhone: string, message: string): boolean {
  const normalizedPhone = normalizePhoneNumber(senderPhone);
  if (normalizedPhone.length < 7) return false;

  // Digit format: extract all digits from the message
  const digitsFromMessage = (message || '').replace(/\D/g, '');
  if (hasSubsequence(normalizedPhone, digitsFromMessage, 6)) return true;

  // Word format: extract word-digit sequences
  const wordSequences = extractWordDigitSequences(message || '');
  for (const seq of wordSequences) {
    if (hasSubsequence(normalizedPhone, seq, 3)) return true;
  }

  return false;
}