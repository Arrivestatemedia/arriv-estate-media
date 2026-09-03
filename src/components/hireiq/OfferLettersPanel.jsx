import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Plus, Pencil, Trash2, CheckCircle, FileText, X } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const MUTED_DARK_40 = "rgba(26,26,26,0.4)";
const MUTED_DARK_70 = "rgba(26,26,26,0.7)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "0.75rem",
};

const DEFAULT_OFFER_TEMPLATE = `Hi {{candidate_first_name}},

Congratulations!

We're excited to offer you the position of {{job_title}} with {{company_name}}.

After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team.

Your Offer

Position: {{job_title}}
Employment Type: Commission-Based W-2

Next Steps

Please review and respond to your offer within 7 days. If you need additional time or have any questions before making your decision, simply reply to your offer email — we're happy to help.

Welcome to {{company_name}}!

Best regards,
{{signature_name}}
{{signature_title}}
{{company_name}}`;

const TEMPLATE_VARIABLES = [
  "{{candidate_first_name}}",
  "{{job_title}}",
  "{{company_name}}",
  "{{signature_name}}",
  "{{signature_title}}",
];

export default function OfferLettersPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", body_content: DEFAULT_OFFER_TEMPLATE, is_active: true });

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await base44.entities.OfferLetter.list("-created_date", 50);
      setTemplates(res?.data ?? res ?? []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleNew = () => {
    setEditTemplate(null);
    setShowEditor(true);
    setForm({ name: "", body_content: DEFAULT_OFFER_TEMPLATE, is_active: templates.length === 0 });
    setError("");
    setSuccess("");
  };

  const handleEdit = (tpl) => {
    setEditTemplate(tpl);
    setShowEditor(true);
    setForm({ name: tpl.name, body_content: tpl.body_content || "", is_active: tpl.is_active });
    setError("");
    setSuccess("");
  };

  const handleClose = () => {
    setShowEditor(false);
    setEditTemplate(null);
    setForm({ name: "", body_content: DEFAULT_OFFER_TEMPLATE, is_active: true });
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.body_content.trim()) {
      setError("Name and body content are required.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (form.is_active) {
        await base44.entities.OfferLetter.updateMany({ is_active: true }, { $set: { is_active: false } });
      }
      if (editTemplate) {
        await base44.entities.OfferLetter.update(editTemplate.id, {
          name: form.name,
          body_content: form.body_content,
          is_active: form.is_active,
        });
        setSuccess("Template updated.");
      } else {
        await base44.entities.OfferLetter.create({
          name: form.name,
          body_content: form.body_content,
          is_active: form.is_active,
        });
        setSuccess("Template created.");
      }
      setEditTemplate(null);
      setShowEditor(false);
      setForm({ name: "", body_content: DEFAULT_OFFER_TEMPLATE, is_active: true });
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    if (!window.confirm(`Delete "${tpl.name}"?`)) return;
    try {
      await base44.entities.OfferLetter.delete(tpl.id);
      await loadTemplates();
      setSuccess("Template deleted.");
      setError("");
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const handleSetActive = async (tpl) => {
    try {
      await base44.entities.OfferLetter.updateMany({ is_active: true }, { $set: { is_active: false } });
      await base44.entities.OfferLetter.update(tpl.id, { is_active: true });
      await loadTemplates();
      setSuccess(`"${tpl.name}" is now the active template.`);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to set active template");
    }
  };

  const insertVariable = (variable) => {
    setForm(prev => ({ ...prev, body_content: prev.body_content + variable }));
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Offer Letter Templates</h2>
          <p className="text-sm mt-0.5" style={{ color: MUTED_DARK }}>Manage reusable offer letter templates with variable substitution</p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: GOLD, color: "#1A1A1A" }}
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {success && <div className="text-sm rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD }}>{success}</div>}
      {error && <div className="text-sm rounded-lg p-3" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626" }}>{error}</div>}

      {templates.length === 0 && !showEditor ? (
        <div className="p-8 text-center" style={whiteCard}>
          <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium" style={{ color: TEXT_DARK }}>No offer letter templates yet</p>
          <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Create a template to standardize your offer letters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tpl => (
            <div key={tpl.id} className="p-4 flex items-start justify-between gap-3" style={whiteCard}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{tpl.name}</h3>
                  {tpl.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
                      <CheckCircle className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-sm truncate" style={{ color: MUTED_DARK_70 }}>
                  {tpl.body_content?.substring(0, 120) || "No content"}...
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!tpl.is_active && (
                  <button
                    onClick={() => handleSetActive(tpl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: "transparent", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                    title="Set as active template"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Set Active
                  </button>
                )}
                <button
                  onClick={() => handleEdit(tpl)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: "transparent", color: MUTED_DARK_70, border: "1px solid rgba(184,149,106,0.2)" }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleDelete(tpl)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: "transparent", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <div className="p-5 space-y-4" style={whiteCard}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{editTemplate ? "Edit Template" : "New Template"}</h3>
            <button onClick={handleClose} className="p-1 rounded" style={{ color: MUTED_DARK_40 }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: MUTED_DARK }}>Template Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Sales Growth Advisor Offer"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ border: "1px solid rgba(184,149,106,0.15)", color: TEXT_DARK }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.15)"}
            />
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: MUTED_DARK }}>Body Content</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARIABLES.map(v => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="text-xs px-2 py-1 rounded font-mono transition-colors"
                  style={{ backgroundColor: "rgba(184,149,106,0.08)", color: GOLD, border: "1px solid rgba(184,149,106,0.15)" }}
                >
                  {v}
                </button>
              ))}
            </div>
            <textarea
              value={form.body_content}
              onChange={e => setForm(prev => ({ ...prev, body_content: e.target.value }))}
              rows={14}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none resize-y"
              style={{ border: "1px solid rgba(184,149,106,0.15)", color: TEXT_DARK }}
              onFocus={e => e.target.style.borderColor = GOLD}
              onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.15)"}
            />
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: MUTED_DARK_70 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
              className="rounded"
            />
            Set as active template
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: MUTED_DARK_70 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: GOLD, color: "#1A1A1A" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editTemplate ? "Update" : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}