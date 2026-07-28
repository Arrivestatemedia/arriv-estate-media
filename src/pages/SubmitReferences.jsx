import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const EMPTY = (type) => ({ name: "", email: "", phone: "", relationship: "", company: "", years_known: "", reference_type: type });

function ReferenceBlock({ index, title, type, values, onChange }) {
  const set = (k, v) => onChange({ ...values, [k]: v });
  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-[#1A1A1A] flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#B8956A] text-white text-xs font-bold flex items-center justify-center">{index + 1}</span>
          {title}
          <span className="text-xs font-normal text-[#1A1A1A]/50 ml-auto">{type === "professional" ? "Professional" : "Character"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Full Name *</Label>
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Email *</Label>
            <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs">Phone *</Label>
            <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Relationship *</Label>
            <Input value={values.relationship} onChange={(e) => set("relationship", e.target.value)} placeholder="e.g. Former manager" required />
          </div>
          <div>
            <Label className="text-xs">How long have they known you? *</Label>
            <Input value={values.years_known} onChange={(e) => set("years_known", e.target.value)} placeholder="e.g. 2 years" required />
          </div>
        </div>
        <div>
          <Label className="text-xs">{type === "professional" ? "Company" : "Company / Organization (if any)"}</Label>
          <Input value={values.company} onChange={(e) => set("company", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubmitReferences() {
  const [refId, setRefId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [refs, setRefs] = useState([EMPTY("professional"), EMPTY("professional"), EMPTY("character")]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("ref");
    setRefId(id || "");
    if (!id) { setError("This reference link is missing a valid token."); setLoading(false); return; }
    base44.functions.invoke("submitApplicantReferences", { reference_id: id })
      .then((res) => {
        if (res.data?.success) {
          setApplicantName(res.data.applicant_name || "");
          setAlreadySubmitted(!!res.data.submitted);
          if (res.data.references && res.data.references.length) {
            setRefs(res.data.references.map((r, i) => ({ ...EMPTY(i < 2 ? "professional" : "character"), ...r })));
          }
        } else setError(res.data?.error || "Could not load this reference request.");
      })
      .catch((e) => setError(e?.data?.error || e?.message || "Could not load this reference request."))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitApplicantReferences", { reference_id: refId, references: refs });
      if (res.data?.success) setDone(true);
      else setError(res.data?.error || "Could not submit references.");
    } catch (err) {
      setError(err?.data?.error || err?.message || "Could not submit references.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]"><Loader2 className="w-6 h-6 text-[#B8956A] animate-spin" /></div>;

  if (done || alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5] px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <h1 className="text-xl font-bold text-[#1A1A1A]">References Submitted</h1>
            <p className="text-sm text-[#1A1A1A]/60">Thank you{applicantName ? `, ${applicantName.split(" ")[0]}` : ""}! Your references have been received. Our team will reach out to your references as part of the hiring process.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Provide Your References</h1>
          <p className="text-sm text-[#1A1A1A]/60">Sales Growth Advisor · Arriv Estate Media</p>
          {applicantName && <p className="text-sm text-[#1A1A1A]/60 mt-1">Applicant: <strong className="text-[#1A1A1A]">{applicantName}</strong></p>}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <ReferenceBlock index={0} title="Reference 1" type="professional" values={refs[0]} onChange={(v) => setRefs([v, refs[1], refs[2]])} />
          <ReferenceBlock index={1} title="Reference 2" type="professional" values={refs[1]} onChange={(v) => setRefs([refs[0], v, refs[2]])} />
          <ReferenceBlock index={2} title="Reference 3" type="character" values={refs[2]} onChange={(v) => setRefs([refs[0], refs[1], v])} />
          <p className="text-xs text-[#1A1A1A]/50">References 1 and 2 must be professional references (managers, supervisors, or colleagues). Reference 3 may be a character reference.</p>
          <button type="submit" disabled={submitting} className="w-full bg-[#B8956A] hover:bg-[#A68559] disabled:opacity-60 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Submitting…" : "Submit References"}
          </button>
        </form>
      </div>
    </div>
  );
}