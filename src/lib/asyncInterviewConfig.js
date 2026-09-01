// Shared configuration for the asynchronous first-round interview system.
// Centralized so the architecture is configurable and future-promotable to Khetha.

// Deadline defaults (hours). Estate Media default = 48.
export const DEADLINE_OPTIONS = [
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
  { label: "72 hours", value: 72 },
];
export const DEFAULT_DEADLINE_HOURS = 48;

// Self-Guided recording config
export const PREP_COUNTDOWN_SECONDS = 15;      // time to read each question before recording
export const DEFAULT_RESPONSE_LIMIT_SECONDS = 90; // default max response duration
export const MAX_RESPONSE_LIMIT_SECONDS = 180;   // hard cap
export const MIN_RESPONSE_LIMIT_SECONDS = 30;    // hard floor

// Per-question response limits (override the default where a question needs more time).
// Keys are canonical question IDs (Q1–Q8).
export const QUESTION_RESPONSE_LIMITS = {
  Q1: 90,
  Q2: 120,  // challenging situation — may need more detail
  Q3: 90,
  Q4: 90,
  Q5: 90,
  Q6: 90,
  Q7: 90,
  Q8: 90,
};

// Re-record policy
export const MAX_INTENTIONAL_RERECORDS = 1; // one intentional re-record per question

// Interview format labels (candidate-facing)
export const FORMAT_LABELS = {
  CONVERSATIONAL_AI: "Conversational Interview",
  SELF_GUIDED_VIDEO: "Self-Guided Video Interview",
};

// Estimated duration shown to candidates
export const ESTIMATED_DURATION_MINUTES = 15;

// Async reminder schedule (hours remaining before deadline)
export const REMINDER_SCHEDULE_HOURS = [24, 4];