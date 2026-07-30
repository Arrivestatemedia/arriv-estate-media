import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, Edit3, Sparkles } from "lucide-react";
import { generateRoleSuccessProfile } from "@/lib/hireiq";

export default function RoleProfileCard({ job, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const profile = draft || job.role_success_profile;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateRoleSuccessProfile(job);
      setDraft(result);
      setEditing(true);
    } catch (err) {
      setError("Failed to generate role profile");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    await onUpdate({ role_success_profile: draft || profile, role_profile_approved: true });
    setEditing(false);
    setDraft(null);
  };

  const handleReject = () => {
    setDraft(null);
    setEditing(false);
  };

  const updateField = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: Array.isArray(value) ? value : value }));
  };

  const listField = (label, field) => {
    const items = profile?.[field] || [];
    return (
      <div key={field}>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
        {editing ? (
          <Textarea value={items.join("\n")} onChange={e => updateField(field, e.target.value.split("\n").filter(Boolean))} rows={3} className="text-sm" />
        ) : (
          <ul className="text-sm text-gray-700 space-y-0.5">
            {items.length === 0 ? <li className="text-gray-400 italic">Not specified</li> : items.map((item, i) => <li key={i}>• {item}</li>)}
          </ul>
        )}
      </div>
    );
  };

  if (!profile && !loading) {
    return (
      <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
        <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">No Role Success Profile yet</p>
        <Button onClick={handleGenerate} style={{ backgroundColor: "#B8956A" }}>
          <Sparkles className="w-4 h-4 mr-2" /> Generate Role Success Profile
        </Button>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
          <span className="ml-2 text-gray-500">Researching similar roles...</span>
        </div>
      )}
      {profile && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {listField("Common Responsibilities", "common_responsibilities")}
            {listField("Typical Skills", "typical_skills")}
            {listField("Common Competencies", "common_competencies")}
            {listField("Performance Expectations", "performance_expectations")}
            {listField("Similar Job Titles", "similar_job_titles")}
            {listField("Missing Competencies (from posting)", "missing_competencies")}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Typical Experience</p>
            {editing ? (
              <Textarea value={profile.typical_experience || ""} onChange={e => updateField("typical_experience", e.target.value)} rows={2} className="text-sm" />
            ) : (
              <p className="text-sm text-gray-700">{profile.typical_experience || "Not specified"}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Industry Expectations</p>
            {editing ? (
              <Textarea value={profile.industry_expectations || ""} onChange={e => updateField("industry_expectations", e.target.value)} rows={2} className="text-sm" />
            ) : (
              <p className="text-sm text-gray-700">{profile.industry_expectations || "Not specified"}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end pt-2 border-t">
            {editing ? (
              <>
                <Button variant="outline" onClick={handleReject}><X className="w-4 h-4 mr-1" /> Reject</Button>
                <Button onClick={handleApprove} style={{ backgroundColor: "#B8956A" }}><Check className="w-4 h-4 mr-1" /> Approve & Save</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleGenerate}><Edit3 className="w-4 h-4 mr-1" /> Regenerate</Button>
                <Button variant="outline" onClick={() => { setDraft(profile); setEditing(true); }}><Edit3 className="w-4 h-4 mr-1" /> Edit</Button>
                {job.role_profile_approved ? (
                  <span className="text-sm text-green-600 flex items-center"><Check className="w-4 h-4 mr-1" /> Approved</span>
                ) : (
                  <Button onClick={() => { setDraft(profile); handleApprove(); }} style={{ backgroundColor: "#B8956A" }}>Approve</Button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}