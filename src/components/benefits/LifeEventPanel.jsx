import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Heart, Plus, X, ExternalLink, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const EVENT_LABELS = {
  marriage: "Marriage",
  divorce: "Divorce",
  birth: "Birth of Child",
  adoption: "Adoption",
  loss_of_coverage: "Loss of Coverage",
  gain_of_coverage: "Gain of Coverage",
  death_of_dependent: "Death of Dependent",
  other: "Other",
};

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  submitted_to_payroll: { label: "Submitted", icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
  in_review: { label: "In Review", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
  processed: { label: "Processed", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  denied: { label: "Denied", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  canceled: { label: "Canceled", icon: XCircle, color: "text-slate-400", bg: "bg-slate-50" },
};

export default function LifeEventPanel({ salesMemberId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    event_type: "marriage",
    event_date: "",
    affected_benefits: [],
    description: "",
  });

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_life_events",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setEvents(data.life_events || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async () => {
    if (!form.event_type || !form.event_date) return;
    setSubmitting(true);
    try {
      await base44.functions.invoke("manageBenefits", {
        action: "submit_life_event",
        sales_member_id: salesMemberId,
        event_type: form.event_type,
        event_date: form.event_date,
        affected_benefits: form.affected_benefits,
        description: form.description,
      });
      setForm({ event_type: "marriage", event_date: "", affected_benefits: [], description: "" });
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const toggleBenefit = (benefit) => {
    setForm((f) => ({
      ...f,
      affected_benefits: f.affected_benefits.includes(benefit)
        ? f.affected_benefits.filter((b) => b !== benefit)
        : [...f.affected_benefits, benefit],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-slate-900">Life Events</h2>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Report Life Event"}
        </Button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Event Type</label>
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {Object.entries(EVENT_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Event Date</label>
            <input
              type="date"
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Affected Benefits</label>
            <div className="flex flex-wrap gap-2">
              {["medical", "dental", "vision", "life_insurance", "fsa", "hsa"].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBenefit(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    form.affected_benefits.includes(b)
                      ? "bg-[#B8956A] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {b.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Add any details that may help HR process your life event..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none"
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitting || !form.event_date} className="w-full">
            {submitting ? "Submitting..." : "Submit Life Event"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-slate-400">Loading life events...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Heart className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No life events reported</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const cfg = STATUS_CONFIG[e.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(e.event_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  {e.description && <p className="text-xs text-slate-400 mt-1 italic">"{e.description}"</p>}
                  {e.secure_workflow_url && (
                    <a
                      href={e.secure_workflow_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#B8956A] mt-2 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Complete changes
                    </a>
                  )}
                  {e.payroll_sync_status === "error" && (
                    <p className="text-xs text-red-500 mt-1">Sync error: {e.payroll_sync_error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}