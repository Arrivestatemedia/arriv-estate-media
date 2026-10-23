import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import CareersProfileHeader from "@/components/careers/CareersProfileHeader";
import PersonalInfoFields from "@/components/careers/PersonalInfoFields";
import ResumeReviewCard from "@/components/careers/ResumeReviewCard";
import ExperienceReviewFields from "@/components/careers/ExperienceReviewFields";
import ScreeningQuestionsFields from "@/components/careers/ScreeningQuestionsFields";
import CareersProfileSubmitted from "@/components/careers/CareersProfileSubmitted";
import useCareersProfileDraft, { clearCareersProfileDraft } from "@/components/careers/useCareersProfileDraft";
import { readResumeFile } from "@/lib/resumeImport";
import { mergeContact, mergeExtract } from "@/lib/careersProfileMerge";
import { CREAM, GOLD, MUTED, SERIF, TEXT_DARK } from "@/components/careers/careersStyles";

const EMPTY_FIELDS = {
  full_name: "",
  email: "",
  phone: "",
  address: "",
  dob: "",
  linkedin: "",
  last_related_job: "",
  why_good_fit: "",
  race: "",
  eeoc_agreed: false,
  signature: "",
};

const EMPTY_EXPERIENCE = {
  summary: "",
  work_history: [],
  education: [],
  certifications: [],
  skills: [],
  uncertain_fields: [],
};

const LINK_MESSAGES = {
  invalid_link: {
    title: "This link is not valid",
    message: "We could not find a Careers Profile for this link. Please use the link from your invitation email or reach out to our recruiting team.",
  },
  expired: {
    title: "This link has expired",
    message: "Your personalized link is no longer active. Contact our recruiting team and we will send you a new one.",
  },
  revoked: {
    title: "This link is no longer active",
    message: "This link has been replaced or withdrawn. Contact our recruiting team if you still wish to be considered.",
  },
};

export default function CareersProfile() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDetailsUrl, setJobDetailsUrl] = useState("");
  const [missing, setMissing] = useState([]);
  const [form, setForm] = useState({ fields: EMPTY_FIELDS, experience: EMPTY_EXPERIENCE, resume: { url: "", file_name: "" } });
  const [replacingResume, setReplacingResume] = useState(false);
  const [resumeNote, setResumeNote] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const draftKey = `arriv_careers_profile_${token}`;
  useCareersProfileDraft(draftKey, form, setForm, !loading && !loadError && !submitted && !!token);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await base44.functions.invoke("getCareersProfile", { token });
        const data = res?.data || {};
        if (!alive) return;

        setFirstName(data.first_name || "there");

        if (data.completion_status === "completed") {
          setSubmitted(true);
          return;
        }

        setJobTitle(data.job_title || "");
        setJobDetailsUrl(data.job_details_url || "");
        setMissing(data.missing_fields || []);
        setForm({
          fields: { ...EMPTY_FIELDS, ...(data.fields || {}) },
          experience: { ...EMPTY_EXPERIENCE, ...(data.experience || {}) },
          resume: { url: data.resume?.url || "", file_name: data.resume?.file_name || "" },
        });
      } catch (err) {
        if (!alive) return;
        const code = err?.response?.data?.error_code || err?.data?.error_code;
        setLoadError(LINK_MESSAGES[code] || {
          title: "We could not open this Careers Profile",
          message: "Please try the link again, or reach out to our recruiting team for help.",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const setFields = (patch) => setForm((prev) => ({ ...prev, fields: { ...prev.fields, ...patch } }));

  const handleResumeReplace = async (file) => {
    setReplacingResume(true);
    setResumeNote(null);
    try {
      const read = await readResumeFile(file, { role: jobTitle || "Sales Growth Advisor" });
      setForm((prev) => ({
        fields: mergeContact(prev.fields, read.contact),
        experience: mergeExtract(prev.experience, read.extract),
        resume: { url: read.url || prev.resume.url, file_name: read.file_name || prev.resume.file_name },
      }));
      setResumeNote({
        type: "success",
        text: read.read_failed
          ? "Résumé replaced. We could not read it automatically, so please check your details below."
          : "Résumé replaced — we re-read it and updated your details.",
      });
    } catch (err) {
      setResumeNote({ type: "error", text: "We could not read that file. You can still submit your Careers Profile." });
    } finally {
      setReplacingResume(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError("");
    setErrors({});
    try {
      await base44.functions.invoke("completeCareersProfile", {
        token,
        fields: form.fields,
        resume_extract: form.experience,
        resume_url: form.resume.url,
        resume_file_name: form.resume.file_name,
      });
      clearCareersProfileDraft(draftKey);
      setSubmitted(true);
    } catch (err) {
      const data = err?.response?.data || err?.data || {};
      if (data.error_code === "validation") {
        setErrors(data.field_errors || {});
        setSubmitError("Please complete the highlighted details and submit again.");
      } else if (LINK_MESSAGES[data.error_code]) {
        setLoadError(LINK_MESSAGES[data.error_code]);
      } else {
        setSubmitError(data.error || "We could not save your Careers Profile. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: CREAM }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        <p className="text-sm" style={{ color: MUTED }}>
          Opening your Careers Profile…
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5" style={{ backgroundColor: CREAM }}>
        <div className="max-w-md text-center p-8 rounded-2xl bg-white" style={{ border: "1px solid rgba(184,149,106,0.3)" }}>
          <AlertTriangle className="w-10 h-10 mx-auto mb-4" style={{ color: GOLD }} />
          <h1 className="text-xl font-bold mb-2" style={{ ...SERIF, color: TEXT_DARK }}>
            {loadError.title}
          </h1>
          <p className="text-sm" style={{ color: MUTED }}>
            {loadError.message}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) return <CareersProfileSubmitted firstName={firstName} />;

  return (
    <div style={{ backgroundColor: CREAM, minHeight: "100vh" }}>
      <CareersProfileHeader
        firstName={firstName}
        jobTitle={jobTitle}
        missingFields={missing}
        jobDetailsUrl={jobDetailsUrl}
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 space-y-6">
        <PersonalInfoFields fields={form.fields} onChange={setFields} errors={errors} />

        <ResumeReviewCard
          fileName={form.resume.file_name}
          url={form.resume.url}
          onReplace={handleResumeReplace}
          replacing={replacingResume}
        />
        {resumeNote && (
          <p className={`text-sm ${resumeNote.type === "error" ? "text-red-600" : ""}`} style={resumeNote.type === "error" ? undefined : { color: "#1A1A1A" }}>
            {resumeNote.text}
          </p>
        )}

        <ExperienceReviewFields
          experience={form.experience}
          onChange={(next) => setForm((prev) => ({ ...prev, experience: next }))}
        />

        <ScreeningQuestionsFields values={form.fields} onChange={setFields} errors={errors} />

        {submitError && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700" style={{ border: "1px solid rgba(220,38,38,0.3)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-semibold transition-colors disabled:opacity-60"
          style={{ backgroundColor: GOLD, color: "#000000" }}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          {submitting ? "Submitting your profile…" : "Submit My Careers Profile"}
        </button>

        <p className="text-xs text-center pb-6" style={{ color: MUTED }}>
          Your answers are saved on this device as you go, so you can open the full position details and come back
          without losing anything.
        </p>
      </div>
    </div>
  );
}