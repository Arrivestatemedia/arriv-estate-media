/**
 * The node catalogue the studio draws, edits and validates against.
 * Kept in one place so the palette, inspector and canvas never disagree.
 */

export const NODE_CATALOG = [
  { type: "incoming_call", label: "Incoming call", group: "start", color: "bg-[#1A1A1A] text-[#FFFBF5]" },
  { type: "play_greeting", label: "Play greeting", group: "audio", color: "bg-[#B8956A]/15 text-[#8a6a44]" },
  { type: "announcement", label: "Announcement", group: "audio", color: "bg-[#B8956A]/15 text-[#8a6a44]" },
  { type: "ivr_menu", label: "IVR menu", group: "menu", color: "bg-[#2A3536]/10 text-[#2A3536]" },
  { type: "gather_keypad", label: "Keypad input", group: "menu", color: "bg-[#2A3536]/10 text-[#2A3536]" },
  { type: "gather_speech", label: "Speech input", group: "menu", color: "bg-[#2A3536]/10 text-[#2A3536]" },
  { type: "conditional_branch", label: "Condition", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "business_hours", label: "Business hours", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "holiday_schedule", label: "Holiday schedule", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "db_lookup", label: "Database lookup", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "transfer_number", label: "Transfer to number", group: "route", color: "bg-blue-50 text-blue-700" },
  { type: "transfer_extension", label: "Transfer to extension", group: "route", color: "bg-blue-50 text-blue-700" },
  { type: "ring_group", label: "Ring group", group: "route", color: "bg-blue-50 text-blue-700" },
  { type: "queue", label: "Queue", group: "route", color: "bg-indigo-50 text-indigo-700" },
  { type: "play_hold_music", label: "Hold music", group: "audio", color: "bg-indigo-50 text-indigo-700" },
  { type: "voicemail", label: "Voicemail", group: "capture", color: "bg-purple-50 text-purple-700" },
  { type: "request_callback", label: "Request callback", group: "capture", color: "bg-purple-50 text-purple-700" },
  { type: "send_sms", label: "Send SMS", group: "capture", color: "bg-purple-50 text-purple-700" },
  { type: "ashley_ai", label: "Ashley AI", group: "ai", color: "bg-[#B8956A] text-[#1A1A1A]" },
  { type: "webhook", label: "Webhook", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "return_previous", label: "Return to menu", group: "logic", color: "bg-[#8a6a44]/10 text-[#6d5330]" },
  { type: "end_call", label: "End call", group: "end", color: "bg-red-50 text-red-700" },
];

export function nodeMeta(type) {
  return NODE_CATALOG.find((n) => n.type === type) || { type, label: type, color: "bg-slate-100 text-slate-700" };
}

const TEXT = (key, label, placeholder = "") => ({ key, label, kind: "text", placeholder });
const AREA = (key, label, placeholder = "") => ({ key, label, kind: "textarea", placeholder });
const NUM = (key, label, placeholder = "") => ({ key, label, kind: "number", placeholder });
const BOOL = (key, label) => ({ key, label, kind: "checkbox" });
const TARGET = (key, label) => ({ key, label, kind: "target" });

export const NODE_FIELDS = {
  incoming_call: [],
  play_greeting: [AREA("text", "What is said", "Thank you for calling Arriv Estate Media."), TEXT("voice_profile_key", "Voice key (optional override)"), NUM("timeout", "Keypad timeout (seconds)"), BOOL("gather", "Accept a keypress straight after the greeting"), TARGET("next_target", "Continue to")],
  announcement: [AREA("text", "What is said"), TEXT("voice_profile_key", "Voice key (optional override)"), TARGET("next_target", "Continue to")],
  ivr_menu: [
    AREA("prompt", "Menu prompt", "Press 1 for sales, press 2 for support."),
    TEXT("voice_profile_key", "Voice key (optional override)"),
    NUM("attempts", "Attempts before fallback"),
    NUM("timeout", "Keypad timeout (seconds)"),
    AREA("invalid_prompt", "Said when the key is not an option"),
    TARGET("invalid_target", "Invalid input goes to"),
    TARGET("no_input_target", "No input goes to"),
  ],
  gather_keypad: [AREA("prompt", "Prompt"), NUM("attempts", "Attempts"), NUM("timeout", "Timeout (seconds)"), TARGET("invalid_target", "Invalid input goes to"), TARGET("no_input_target", "No input goes to")],
  gather_speech: [AREA("prompt", "Prompt"), TEXT("hints", "Recognition hints"), TEXT("language", "Language (en-US)"), TARGET("no_match_target", "Not understood goes to")],
  conditional_branch: [AREA("conditions", "Conditions (edited in the rule builder)"), TARGET("true_target", "When true"), TARGET("false_target", "When false")],
  business_hours: [TARGET("open_target", "When open"), TARGET("closed_target", "When closed")],
  holiday_schedule: [TARGET("holiday_target", "On a holiday"), TARGET("normal_target", "Otherwise")],
  db_lookup: [TEXT("field", "Field to look up", "caller number"), TARGET("success_target", "Recognised caller"), TARGET("failure_target", "Unknown caller")],
  transfer_number: [TEXT("number", "Destination number", "+14047891107"), NUM("timeout", "Ring seconds"), AREA("whisper_text", "Private announcement to the answering person", "Call from a property owner."), TARGET("no_answer_target", "No answer goes to"), TARGET("busy_target", "Busy goes to"), TARGET("failed_target", "Failed transfer goes to")],
  transfer_extension: [TEXT("extension", "Extension"), TEXT("map", "Extension map (extension=number, comma separated)"), NUM("timeout", "Ring seconds"), TARGET("no_answer_target", "No answer goes to")],
  ring_group: [TEXT("mode", "Mode: simultaneous or sequential"), NUM("ring_seconds", "Ring seconds"), AREA("whisper_text", "Private announcement to the answering person"), TARGET("no_answer_target", "No answer goes to")],
  queue: [AREA("prompt", "Queue prompt"), AREA("leave_message_prompt", "Message option prompt"), TEXT("hold_music_url", "Hold music URL"), NUM("loop", "Hold music repeats"), TARGET("no_answer_target", "Caller gives up →")],
  play_hold_music: [TEXT("hold_music_url", "Hold music URL"), NUM("loop", "Repeats")],
  voicemail: [AREA("prompt", "Prompt before the beep"), NUM("max_seconds", "Maximum message length (seconds)"), BOOL("transcribe", "Transcribe the message"), TEXT("category", "Category"), TARGET("next_target", "After the message")],
  send_sms: [AREA("message", "Message", "Thanks for calling Arriv. We will be in touch."), TEXT("to", "Send to: caller or custom"), TEXT("number", "Custom number"), TARGET("success_target", "Sent →"), TARGET("failure_target", "Failed →")],
  request_callback: [AREA("prompt", "Confirmation prompt"), TEXT("category", "Category")],
  ashley_ai: [TEXT("department", "Department Ashley handles", "general"), TARGET("fallback_target", "AI unavailable →")],
  webhook: [TEXT("url", "https URL"), TEXT("method", "Method (POST)"), TARGET("success_target", "On success"), TARGET("failure_target", "On failure")],
  return_previous: [TARGET("fallback_target", "No previous menu →")],
  end_call: [AREA("message", "Last words before hanging up")],
};

export const MENU_OPTION_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"];

export function blankNode(type, index) {
  const id = `n_${type}_${Date.now().toString(36)}${index}`;
  const config = {};
  if (type === "ivr_menu" || type === "gather_keypad") {
    config.prompt = "Press 1 for sales, press 2 for support.";
    config.options = [{ key: "1", label: "Option 1", target: "" }];
    config.attempts = 3;
    config.timeout = 6;
  }
  if (type === "play_greeting" || type === "announcement") config.text = "";
  if (type === "transfer_number") {
    config.number = "";
    config.timeout = 25;
  }
  if (type === "ring_group") {
    config.mode = "simultaneous";
    config.ring_seconds = 22;
    config.members = [{ name: "Member 1", number: "" }];
  }
  if (type === "voicemail") {
    config.prompt = "Please leave a message after the tone.";
    config.max_seconds = 180;
  }
  if (type === "ashley_ai") config.department = "general";
  return {
    id,
    type,
    label: nodeMeta(type).label,
    x: 120 + (index % 4) * 240,
    y: 120 + Math.floor(index / 4) * 170,
    config,
    next: {},
  };
}

/** Every node id this node can lead to — mirrors how the runtime finds edges. */
export function targetsOfNode(node, nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const out = [];
  const scan = (value) => {
    if (typeof value === "string") {
      if (ids.has(value) && !out.includes(value)) out.push(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(scan);
    if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan(node.next || {});
  scan(node.config || {});
  return out;
}

export function labelForNode(node) {
  return node?.label || nodeMeta(node?.type).label;
}