import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Copy, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { emptyExtract, RESUME_ACCEPT, readResumeFile } from "@/lib/resumeImport";
import { fieldsToConfirm } from "@/lib/careersProfileMerge";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  phone: "",
  address: "",
  dob: "",
  linkedin: "",
  last_related_job: "",
  job_opening_id: "",
  resume_url: "",
  resume_file_name: "",
};

/**
 * Import an Indeed applicant: read their résumé, confirm the details that were
 * found, then add them to the existing Sales Growth Advisor pipeline and issue
 * their personalized Careers Profile link.
 */
export default function ImportIndeedApplicantModal({ open, onOpenChange, openings = [], onImported }) {
  const inputRef = useRef(null);
  const [step, setStep] = useState("upload");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [extract, setExtract] = useState(emptyExtract());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState("");

  // Sales Growth Advisor openings, including per-region ones.
  const salesOpenings = useMemo(() => {
    const list = openings || [];
    const sales = list.filter((o) => {
      const haystart = `${o.position || ""} ${o.title || ""} ${o.source_url || ""}`.toLowerCase();
      return haystart.includes("sales");
    });
    return sales.length ? sales : list;
  }, [openings]);

  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setReadError("");
    setSaveError("");
    setDuplicate("");
    setResult(null);
    setCopied("");
    setExtract(emptyExtract());
    setForm({ ...EMPTY_FORM, job_opening_id: salesOpenings[0]?.job_id || "" });
  }, [open, salesOpenings]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const copy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(""), 2500);
    } catch (err) {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setReading(true);
    setReadError("");
    try {
      const read = await readResumeFile(file, { role: "Sales Growth Advisor" });
      setExtract(read.extract);
      setForm((prev) => ({
        ...prev,
        full_name: read.contact.full_name || prev.full_name,
        email: read.contact.email || prev.email,
        phone: read.contact.phone || prev.phone,
        address: read.contact.address || prev.address,
        dob: read.contact.dob || prev.dob,
        linkedin: read.contact.linkedin || prev.linkedin,
        last_related_job: read.extract.summary || prev.last_related_job,
        resume_url: read.url,
        resume_file_name: read.file_name,
      }));
      setStep("details");
    } catch (err) {
      setReadError("We could not read that résumé. Please try another file.");
    } finally {
      setReading(false);
    }
  };

  const runImport = async () => {
    if (!form.job_opening_id) return setSaveError("Select the opening this applicant applied to.");
    if (!form.full_name.trim()) return setSaveError("The applicant's full name is required.");
    if (!form.email.trim() || !form.email.includes("@")) return setSaveError("A valid email address is required.");

    setSaving(true);
    setSaveError("");
    setDuplicate("");
    try {
      const res = await base44.functions.invoke("importIndeedApplicant", {
        action: "import",
        job_opening_id: form.job_opening_id,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        dob: form.dob,
        linkedin: form.linkedin,
        last_related_job: form.last_related_job,
        resume_url: form.resume_url,
        resume_file_name: form.resume_file_name,
        resume_extract: extract,
      });
      setResult(res.data || {});
      setStep("done");
      if (onImported) onImported();
    } catch (err) {
      const data = err?.response?.data || err?.data || {};
      if (err?.response?.status === 409 || data.error === "duplicate") {
        setDuplicate(data.message || "This applicant already has an application for this position.");
      } else {
        setSaveError(data.error || "The applicant could not be imported. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const needsConfirm = fieldsToConfirm(form, extract.uncertain_fields || []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[#B8956A]" />
            Import Indeed Applicant
          </DialogTitle>
          <DialogDescription>
            Upload the applicant's résumé. We read what it contains, add them to the Sales Growth Advisor pipeline, and
            prepare their personalized Careers Profile link.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept={RESUME_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={reading}
              className="w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-2 transition-colors disabled:opacity-60"
              style={{ borderColor: "rgba(184,149,106,0.5)" }}
            >
              {reading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
                  <span className="text-sm font-medium text-[#1A1A1A]">Reading the résumé…</span>
                </>
              ) : (
                <>
                  <FileText className="w-6 h-6 text-[#B8956A]" />
                  <span className="text-sm font-medium text-[#1A1A1A]">Choose résumé file</span>
                  <span className="text-xs text-[#1A1A1A]/60">PDF, DOC or DOCX</span>
                </>
              )}
            </button>
            {readError && <p className="text-sm text-red-600">{readError}</p>}
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#B8956A]/10 text-sm text-[#1A1A1A]/80">
              <Sparkles className="w-4 h-4 text-[#B8956A] shrink-0" />
              <span>
                Details read from <strong>{form.resume_file_name || "the résumé"}</strong>. Confirm or correct them
                before importing.
              </span>
            </div>

            {needsConfirm.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Not found on the résumé, the applicant will be asked to complete it: {needsConfirm.join(", ")}.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={set("full_name")} />
              </div>
              <div>
                <Label>Email Address *</Label>
                <Input type="email" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input value={form.phone} onChange={set("phone")} />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dob} onChange={set("dob")} />
                <p className="text-xs text-[#1A1A1A]/60 mt-1">Only if printed on the résumé — never inferred.</p>
              </div>
              <div className="sm:col-span-2">
                <Label>Residential Address</Label>
                <Input value={form.address} onChange={set("address")} />
              </div>
              <div className="sm:col-span-2">
                <Label>LinkedIn Profile</Label>
                <Input value={form.linkedin} onChange={set("linkedin")} />
              </div>
              <div className="sm:col-span-2">
                <Label>Most Recent Related Experience</Label>
                <Input value={form.last_related_job} onChange={set("last_related_job")} />
              </div>
              <div className="sm:col-span-2">
                <Label>Applied To *</Label>
                <select
                  value={form.job_opening_id}
                  onChange={set("job_opening_id")}
                  className="w-full h-10 rounded-md border border-[#B8956A]/30 bg-white px-3 text-sm"
                >
                  <option value="">Select an opening…</option>
                  {salesOpenings.map((o) => (
                    <option key={o.job_id || o.id} value={o.job_id}>
                      {o.location ? `${o.location} — ${o.title}` : o.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {extract.summary && (
              <div className="text-sm border-t border-[#B8956A]/20 pt-3">
                <p className="font-medium text-[#1A1A1A] mb-1">Résumé summary</p>
                <p className="text-[#1A1A1A]/70 whitespace-pre-wrap">{extract.summary}</p>
              </div>
            )}

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            {duplicate && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{duplicate} Their Careers Profile is already complete, so nothing was overwritten.</span>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#B8956A]/10 text-sm text-[#1A1A1A]/80">
              <CheckCircle2 className="w-4 h-4 text-[#B8956A] shrink-0 mt-0.5" />
              <span>
                {form.full_name} was added to the Sales Growth Advisor pipeline as{" "}
                <strong>awaiting Careers Profile completion</strong>
                {result.matched_existing ? " (matched to their existing application)." : "."} They appear in this
                Applications list, and the Khetha IQ evaluation is being refreshed.
              </span>
            </div>

            <div>
              <Label>Personalized Careers Profile link</Label>
              <div className="flex gap-2">
                <Input readOnly value={result.link || ""} className="text-xs" />
                <button
                  type="button"
                  onClick={() => copy(result.link, "Link")}
                  className="inline-flex items-center gap-2 px-3 rounded-lg text-sm font-medium border border-[#B8956A] text-[#B8956A] whitespace-nowrap"
                >
                  <Copy className="w-4 h-4" />
                  {copied === "Link" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Expires {result.token_expires_at ? new Date(result.token_expires_at).toLocaleDateString() : "in 30 days"}.
                Regenerating it later replaces this link.
              </p>
            </div>

            <div>
              <Label>Message to send on Indeed</Label>
              <textarea
                readOnly
                rows={10}
                value={result.invitation_message || ""}
                className="w-full rounded-md border border-[#B8956A]/30 bg-white p-3 text-xs whitespace-pre-wrap"
              />
              <button
                type="button"
                onClick={() => copy(result.invitation_message, "Message")}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1A1A1A] text-[#FFFBF5]"
              >
                <Copy className="w-4 h-4" />
                {copied === "Message" ? "Copied" : "Copy message"}
              </button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== "done" && (
            <button
              type="button"
              onClick={() => (step === "details" ? setStep("upload") : onOpenChange(false))}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1A1A1A]/20 text-[#1A1A1A]"
            >
              {step === "details" ? "Choose a different résumé" : "Cancel"}
            </button>
          )}
          {step === "details" && (
            <button
              type="button"
              onClick={runImport}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#B8956A] text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {saving ? "Importing…" : "Import & Create Link"}
            </button>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A1A1A] text-[#FFFBF5]"
            >
              Done
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}