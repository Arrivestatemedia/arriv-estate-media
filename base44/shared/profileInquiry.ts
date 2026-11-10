// Profile inquiries: validation, consent, spam assessment and routing.
//
// The rules this module encodes:
//   * an inquiry is recorded before anything is sent, so a delivery failure never loses a lead;
//   * it is routed only to an address the profile itself authorized (the owner, or a brokerage's
//     configured team), never to an unrelated agent;
//   * it is never accepted without explicit consent to share it with that recipient.

import { PROFILE_DISCLOSURES } from "./professionalProfile.ts";

export const MIN_MESSAGE_CHARS = 10;
export const MAX_MESSAGE_CHARS = 2000;

export function inquiryDisclosures(profileType: string): string[] {
  const shared =
    profileType === "brokerage"
      ? "Your inquiry is delivered to the brokerage you contacted so a member of their team can respond. It is not sold or shared with other agents."
      : "Your inquiry is delivered only to the professional you contacted so they can respond. It is not sold or shared with other agents.";
  return [...PROFILE_DISCLOSURES, shared];
}

export function inquiryConsentText(recipientName: string): string {
  return (
    `I agree that the details I submit here, including my name, email and optional phone number, may be shared with ` +
    `${recipientName || "this professional"} so they can respond to my inquiry about their services.`
  );
}

function sanitize(value: any, max = 400): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function normalizeInquiryInput(body: any) {
  return {
    name: sanitize(body?.name, 120),
    email: sanitize(body?.email, 200).toLowerCase(),
    phone: sanitize(body?.phone, 40),
    message: sanitize(body?.message, MAX_MESSAGE_CHARS),
    consent_privacy: body?.consent_privacy === true || body?.consent_privacy === "true",
    honeypot: sanitize(body?.company_website, 200),
  };
}

export function validateInquiry(input: any): string[] {
  const errors: string[] = [];
  if (!input?.name || input.name.length < 2) errors.push("Please enter your name.");
  if (!input?.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) errors.push("Please enter a valid email address.");
  if (!input?.message || input.message.length < MIN_MESSAGE_CHARS) errors.push(`Please tell us a little more (at least ${MIN_MESSAGE_CHARS} characters).`);
  if (input?.consent_privacy !== true) errors.push("Please agree to the inquiry sharing notice so we can pass your message on.");
  return errors;
}

// Deterministic spam scoring. Every signal is explainable, and a high score moves the inquiry to human
// review rather than silently discarding a real person's message.
export function assessSpam(input: any, ctx: { recentFromEmail?: number; recentFromIp?: number } = {}): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  if (input?.honeypot) {
    // The hidden field is never reachable by a person, so a value in it is definitive.
    score += 95;
    flags.push("honeypot_tripped");
  }
  const message = String(input?.message || "");
  const links = (message.match(/https?:\/\//gi) || []).length;
  if (links >= 2) {
    score += 30;
    flags.push("multiple_links");
  } else if (links === 1) {
    score += 10;
    flags.push("contains_link");
  }
  if (/\[url=|<a href=/i.test(message)) {
    score += 30;
    flags.push("markup_link");
  }
  if (/(seo services|rank your|guest post|crypto|loan offer|bitcoin|casino)/i.test(message)) {
    score += 35;
    flags.push("commercial_keywords");
  }
  const letters = message.replace(/[^A-Za-z]/g, "");
  const caps = message.replace(/[^A-Z]/g, "");
  if (letters.length > 20 && caps.length / letters.length > 0.6) {
    score += 15;
    flags.push("excessive_caps");
  }
  if (Number(ctx.recentFromEmail || 0) >= 3) {
    score += 25;
    flags.push("repeated_sender");
  }
  if (Number(ctx.recentFromIp || 0) >= 8) {
    score += 25;
    flags.push("repeated_ip");
  }
  return { score: Math.min(100, score), flags };
}

export const SPAM_REVIEW_THRESHOLD = 50;

export function statusForSpam(score: number): "received" | "review" | "rejected_spam" {
  if (score >= 90) return "rejected_spam";
  if (score >= SPAM_REVIEW_THRESHOLD) return "review";
  return "received";
}

// Who the inquiry belongs to. Team routing is used only when the profile is configured for it and has
// at least one authorized team address; otherwise it goes to the profile's own contact address.
export function routeInquiry(profile: any): { routed_to_email: string; routing_mode: string; routing_reason: string; ok: boolean } {
  const owner = String(profile?.contact_email || "").trim().toLowerCase();
  const team = (Array.isArray(profile?.team_emails) ? profile.team_emails : [])
    .map((e: any) => String(e || "").trim().toLowerCase())
    .filter((e: string) => e.includes("@"));

  if (profile?.profile_type === "brokerage" && profile?.routing_mode === "team") {
    const configured = (Array.isArray(profile?.routing_emails) ? profile.routing_emails : [])
      .map((e: any) => String(e || "").trim().toLowerCase())
      .filter((e: string) => e.includes("@"));
    const eligible = configured.filter((e: string) => team.includes(e) || e === owner);
    if (eligible.length) {
      return {
        routed_to_email: eligible[0],
        routing_mode: "team",
        routing_reason: "Brokerage team routing rule",
        ok: true,
      };
    }
    if (team.length) {
      return {
        routed_to_email: team[0],
        routing_mode: "team_fallback",
        routing_reason: "No configured routing matched an authorized team member; delivered to the first authorized team address",
        ok: true,
      };
    }
  }

  if (owner.includes("@")) {
    return { routed_to_email: owner, routing_mode: "owner", routing_reason: "Profile contact address", ok: true };
  }
  return { routed_to_email: "", routing_mode: "unroutable", routing_reason: "The profile has no authorized contact address", ok: false };
}

export function channelFrom(utm: Record<string, any>, referrerHost: string): "paid" | "social" | "organic" | "referral" | "internal" | "direct" {
  const medium = String(utm?.utm_medium || "").toLowerCase();
  const source = String(utm?.utm_source || "").toLowerCase();
  if (/cpc|paid|ppc|display/.test(medium) || /google_ads|meta_ads|facebook_ads/.test(source)) return "paid";
  if (/social/.test(medium) || /facebook|instagram|linkedin|tiktok|x\.com|twitter/.test(source)) return "social";
  if (/email|newsletter/.test(medium)) return "internal";
  if (!referrerHost) return "direct";
  if (/arrivestatemedia\.com$/i.test(referrerHost)) return "internal";
  if (/google\.|bing\.|duckduckgo\./.test(referrerHost)) return "organic";
  return "referral";
}

export function inquiryEmailBody(opts: {
  profile: any;
  inquiry: any;
  sourceLabel: string;
}): { subject: string; text: string } {
  const name = String(opts.profile?.display_name || "your profile");
  const subject = `New inquiry from ${opts.inquiry?.name || "a visitor"} — ${name}`;
  const lines = [
    `You have a new inquiry submitted from ${opts.sourceLabel} on Arriv Estate Media.`,
    "",
    `Name: ${opts.inquiry?.name || ""}`,
    `Email: ${opts.inquiry?.email || ""}`,
  ];
  if (opts.inquiry?.phone) lines.push(`Phone: ${opts.inquiry.phone}`);
  lines.push(
    "",
    "Message:",
    String(opts.inquiry?.message || ""),
    "",
    "Reply directly to this message to answer the person who contacted you.",
    "",
    "This inquiry was submitted by a visitor who agreed to have their details shared with you so you could respond. " +
      "Please use it only to answer this inquiry.",
    "",
    "Arriv Estate Media is a real estate media company. Arriv is not the listing brokerage, the seller's agent or the " +
      "buyer's representative, and hosting this profile does not make Arriv a party to any transaction.",
  );
  return { subject, text: lines.join("\n") };
}