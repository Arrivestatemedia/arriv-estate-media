// Reads the applicant information that is genuinely present in an uploaded résumé.
//
// Uses the app's existing résumé infrastructure: the platform's file extraction
// for identity and contact details, and the existing Khetha IQ résumé analysis
// for employment history, education and qualifications.
//
// Nothing is inferred. A value that is not printed on the résumé comes back
// empty, and anything the extraction is unsure about is reported as uncertain so
// a human can confirm it.

import { base44 } from "@/api/base44Client";
import { analyzeResumeFile } from "@/lib/hireiq";

const CONTACT_SCHEMA = {
  type: "object",
  properties: {
    full_name: { type: "string", description: "Applicant's full name exactly as printed on the résumé" },
    email: { type: "string" },
    phone: { type: "string" },
    address: { type: "string", description: "Full residential street address, city, state and ZIP — only when printed on the résumé" },
    dob: {
      type: "string",
      description:
        "Date of birth in YYYY-MM-DD form ONLY when a date of birth is explicitly printed on the résumé. Never derive it from graduation dates, employment dates or age. Leave empty when it is not printed.",
    },
    linkedin: { type: "string", description: "LinkedIn profile URL when printed on the résumé" },
    uncertain_fields: {
      type: "array",
      items: { type: "string" },
      description: "Names of the fields above whose value is unclear, partial or ambiguous in the résumé",
    },
  },
};

export const RESUME_ACCEPT = ".pdf,.doc,.docx";

export function emptyExtract() {
  return {
    summary: "",
    work_history: [],
    education: [],
    certifications: [],
    skills: [],
    uncertain_fields: [],
  };
}

const asText = (value) => (typeof value === "string" ? value.trim() : "");
const asList = (value) =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()) : [];

/**
 * Uploads the résumé (stored publicly — anyone with the link can open them),
 * then reads it. Returns the stored address, the contact details found, and the
 * structured experience the résumé supports.
 */
export async function readResumeFile(file, jobContext) {
  const uploadRes = await base44.integrations.Core.UploadPublicFile({ file });
  const url = uploadRes?.file_url || uploadRes?.data?.file_url || "";

  const result = {
    url,
    file_name: file?.name || "",
    contact: {},
    extract: emptyExtract(),
    read_failed: false,
  };

  if (!url) {
    result.read_failed = true;
    return result;
  }

  try {
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url: url,
      json_schema: CONTACT_SCHEMA,
    });
    const raw = res?.output ?? res?.data?.output;
    const out = Array.isArray(raw) ? raw[0] || {} : raw || {};
    result.contact = {
      full_name: asText(out.full_name),
      email: asText(out.email),
      phone: asText(out.phone),
      address: asText(out.address),
      dob: asText(out.dob),
      linkedin: asText(out.linkedin),
      uncertain_fields: asList(out.uncertain_fields),
    };
  } catch (err) {
    result.read_failed = true;
  }

  try {
    const analysis = await analyzeResumeFile(url, jobContext || {}, undefined);
    result.extract = {
      summary: asText(analysis?.parsed_experience),
      work_history: asList(analysis?.parsed_work_history),
      education: asList(analysis?.parsed_education),
      certifications: asList(analysis?.parsed_certifications),
      skills: asList(analysis?.parsed_skills),
      uncertain_fields: result.contact.uncertain_fields || [],
    };
  } catch (err) {
    /* the contact details above are still usable */
  }

  return result;
}