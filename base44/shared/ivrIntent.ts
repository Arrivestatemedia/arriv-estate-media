/**
 * Spoken-request understanding for the Arriv IVR.
 *
 * Deterministic first: a spoken request that clearly matches a known phrase is
 * routed immediately, with no model call and no chance of a misread. Only when
 * nothing matches does the caller get the approved "I didn't quite catch that"
 * fallback with the keypad options.
 */

export type IvrIntent =
  | 'media_partner'
  | 'technical_support'
  | 'booking_help'
  | 'callback'
  | 'sales'
  | 'signup_help'
  | 'human'
  | 'voicemail'
  | 'unclear';

const PATTERNS: Array<{ intent: IvrIntent; phrases: RegExp[] }> = [
  {
    intent: 'media_partner',
    phrases: [
      /\bmedia partner\b/,
      /\bmy (rep|representative|advisor|adviser|agent|contact|account (manager|contact|rep))\b/,
      /\bsales (rep|representative|agent|person)\b/,
      /\bgrowth advisor\b/,
      /\btalk to (someone|somebody) (about|on) my account\b/,
    ],
  },
  {
    intent: 'technical_support',
    phrases: [
      /\b(can'?t|cannot|can not|unable to) (sign|log) ?(in|on)\b/,
      /\b(sign|log) ?in (problem|issue|trouble|isn'?t|not)\b/,
      /\b(password|reset my password)\b/,
      /\bportal\b.*\b(not|isn'?t|won'?t|broken|down|error)\b/,
      /\bnot working\b/,
      /\bbroken\b/,
      /\btechnical (support|issue|problem|help)\b/,
      /\btech support\b/,
      /\bwebsite (is )?(down|broken|not)\b/,
      /\berror\b/,
      /\bpage (won'?t|will not) load\b/,
    ],
  },
  {
    intent: 'booking_help',
    phrases: [
      /\b(change|move|reschedule|cancel|confirm) (my|the) (booking|appointment|shoot)\b/,
      /\bmy (booking|appointment|shoot|schedule)\b/,
      /\bwhat time\b/,
      /\bwhen is (my|the) (shoot|appointment|booking)\b/,
      /\bbooking (details|status|question)\b/,
    ],
  },
  {
    intent: 'callback',
    phrases: [/\bcall me back\b/, /\bcallback\b/, /\bcall back\b/, /\breturn my call\b/, /\bphone me\b/],
  },
  {
    intent: 'sales',
    phrases: [
      /\bbook (media|photos?|photography|video|a shoot|a photographer)\b/,
      /\b(photo|photos|photography|video|videography|drone|floor plan|twilight|virtual tour)\b/,
      /\blisting\b/,
      /\bnew (property|listing)\b/,
      /\bpricing|price list|packages?\b/,
      /\bget (my|the) (house|home|property) (photographed|shot)\b/,
    ],
  },
  {
    intent: 'signup_help',
    phrases: [/\bsign ?up\b/, /\bcreate an? account\b/, /\bregister\b/, /\bhow do i (book|order|sign up)\b/, /\bassistance\b/],
  },
  {
    intent: 'human',
    phrases: [/\bspeak (to|with) (a )?(someone|somebody|person|human|representative|owner)\b/, /\btransfer me\b/, /\breal person\b/],
  },
  {
    intent: 'voicemail',
    phrases: [/\bleave a (message|voicemail)\b/, /\bvoicemail\b/],
  },
];

/** Digit fallbacks the caller hears after an unclear request, per context. */
export function fallbackMenuFor(context: 'media_specialist' | 'client' | 'public'): string {
  if (context === 'client') {
    return 'I\u2019m sorry, I didn\u2019t quite catch that. To reach your Media Partner, press 1. For technical support, press 2.';
  }
  return 'I\u2019m sorry, I didn\u2019t quite catch that. To speak with support, press 1.';
}

export function classifySpokenRequest(raw: string, context: 'media_specialist' | 'client' | 'public'): IvrIntent {
  const text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return 'unclear';

  for (const entry of PATTERNS) {
    if (entry.phrases.some((pattern) => pattern.test(text))) {
      // A public caller cannot be routed to "my Media Partner"; that request is a sales call.
      if (entry.intent === 'media_partner' && context === 'public') return 'sales';
      return entry.intent;
    }
  }

  if (context === 'media_specialist' && /\b(help|support|question|problem)\b/.test(text)) {
    return 'technical_support';
  }
  return 'unclear';
}

/**
 * Maps a spoken request onto the digits the keypad fallback would have produced,
 * so one code path handles both inputs.
 */
export function intentToDigit(intent: IvrIntent, context: 'media_specialist' | 'client' | 'public'): string {
  if (context === 'client') {
    if (intent === 'media_partner') return '1';
    if (intent === 'technical_support' || intent === 'signup_help') return '2';
    return '';
  }
  if (context === 'public') {
    if (intent === 'sales' || intent === 'booking_help') return '1';
    if (intent === 'technical_support' || intent === 'signup_help') return '2';
    return '';
  }
  // Media specialists: everything that is not a callback or voicemail goes to support.
  if (intent === 'callback') return '1';
  if (intent === 'voicemail') return '2';
  return '';
}