import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertTriangle, Clock, Plus, X, PhoneCall, Heart } from "lucide-react";
import { POST_SERVICE_OUTCOMES, POST_SERVICE_SCRIPT, RECOVERY_PROTOCOL } from "@/lib/salesTrainingData";

const getMember = () => ({
  id: localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id'),
  name: localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name'),
  email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email'),
});

const SEVERITY_COLORS = {
  MINOR: "bg-orange-100 text-orange-700",
  MAJOR: "bg-red-100 text-red-700",
  CRITICAL: "bg-red-200 text-red-800",
};

const STATUS_COLORS = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-blue-100 text-blue-700",
  CLOSED: "bg-[#B8956A] text-[#1A1A1A]",
};

export default function CustomerSuccessPage() {
  const [recoveries, setRecoveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [logging, setLogging] = useState(null);
  const member = getMember();

  const load = useCallback(async () => {
    if (!member.id) return;
    try {
      const list = await base44.entities.CustomerRecovery.filter({ assigned_rep_id: member.id }, '-created_at', 200);
      setRecoveries(list || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [member.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.CustomerRecovery.create({
        ...data,
        assigned_rep_id: member.id,
        assigned_rep_name: member.name,
        status: "OPEN",
        rep_close_loop_required: true,
        created_at: now,
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      await base44.entities.AuditEvent.create({
        event_type: "CUSTOMER_RECOVERY_CREATED",
        sales_member_id: member.id, sales_member_name: member.name,
        actor_id: member.id, actor_name: member.name, actor_role: "REP",
        entity_type: "CustomerRecovery",
        timestamp: now,
      });
      setShowForm(false); await load();
    } catch (err) { console.error(err); }
  };

  const handleLogOutcome = async (recovery, outcome, notes) => {
    try {
      const now = new Date().toISOString();
      const isIssue = outcome === "MINOR_ISSUE" || outcome === "MAJOR_ISSUE";
      const updateData = { outcome, status: isIssue ? "IN_PROGRESS" : "RESOLVED", resolution: notes, resolved_at: isIssue ? undefined : now };
      
      // If not an issue, close the loop immediately
      if (!isIssue) {
        updateData.rep_close_loop_completed_at = now;
        updateData.status = "CLOSED";
      }
      
      await base44.entities.CustomerRecovery.update(recovery.id, updateData);
      await base44.entities.AuditEvent.create({
        event_type: "POST_SERVICE_FOLLOWUP_COMPLETED",
        sales_member_id: member.id, sales_member_name: member.name,
        actor_id: member.id, actor_name: member.name, actor_role: "REP",
        entity_type: "CustomerRecovery", entity_id: recovery.id,
        details: { outcome, notes },
        timestamp: now,
      });
      setLogging(null); await load();
    } catch (err) { console.error(err); }
  };

  const handleCloseLoop = async (recovery) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.CustomerRecovery.update(recovery.id, {
        rep_close_loop_completed_at: now,
        status: "CLOSED",
      });
      await base44.entities.AuditEvent.create({
        event_type: "CUSTOMER_RECOVERY_CLOSED_LOOP",
        sales_member_id: member.id, sales_member_name: member.name,
        actor_id: member.id, actor_name: member.name, actor_role: "REP",
        entity_type: "CustomerRecovery", entity_id: recovery.id,
        timestamp: now,
      });
      await load();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  if (!member.id) return <div className="p-8 text-center text-slate-500">Please log in.</div>;

  const openCases = recoveries.filter(r => r.status === "OPEN" || r.status === "IN_PROGRESS");
  const resolvedCases = recoveries.filter(r => r.status === "RESOLVED" || r.status === "CLOSED");
  const closeLoopPending = recoveries.filter(r => r.status === "RESOLVED" && !r.rep_close_loop_completed_at);

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Customer Success</h1>
            <p className="text-slate-600">Post-service follow-ups and customer recovery management</p>
          </div>
          <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" /> New Follow-Up</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-white border-[#B8956A]/15">
            <Clock className="w-6 h-6 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{openCases.length}</p>
            <p className="text-xs text-slate-500">Open Cases</p>
          </Card>
          <Card className="p-4 bg-white border-[#B8956A]/15">
            <AlertTriangle className="w-6 h-6 text-orange-500 mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{closeLoopPending.length}</p>
            <p className="text-xs text-slate-500">Close-the-Loop Pending</p>
          </Card>
          <Card className="p-4 bg-white border-[#B8956A]/15">
            <CheckCircle2 className="w-6 h-6 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{resolvedCases.length}</p>
            <p className="text-xs text-slate-500">Resolved / Closed</p>
          </Card>
        </div>

        {closeLoopPending.length > 0 && (
          <Card className="p-4 mb-4 bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <p className="font-semibold text-orange-800">Close-the-Loop Required</p>
            </div>
            <p className="text-sm text-orange-700 mb-3">These cases were resolved operationally but still need you to close the loop with the customer.</p>
            <div className="space-y-2">
              {closeLoopPending.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                  <div>
                    <p className="font-medium text-[#1A1A1A]">{r.customer_name}</p>
                    <p className="text-xs text-slate-500">Resolved: {r.resolution || "No details"}</p>
                  </div>
                  <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => handleCloseLoop(r)}>
                    <PhoneCall className="w-4 h-4 mr-1" /> Close Loop
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {showForm && <RecoveryForm onSave={handleSave} onCancel={() => setShowForm(false)} />}

        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">All Cases</h2>
        <div className="space-y-3">
          {recoveries.length === 0 ? (
            <Card className="p-8 text-center bg-white"><Heart className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No customer success cases yet. Click "New Follow-Up" to log a post-service check.</p></Card>
          ) : recoveries.map(r => (
            <Card key={r.id} className="p-4 bg-white border-[#B8956A]/15">
              {logging?.id === r.id ? (
                <OutcomeForm recovery={r} onLog={handleLogOutcome} onCancel={() => setLogging(null)} />
              ) : (
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#1A1A1A]">{r.customer_name || "Unknown Customer"}</h3>
                      <Badge className={STATUS_COLORS[r.status] || STATUS_COLORS.OPEN}>{r.status}</Badge>
                      <Badge className={SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.MINOR}>{r.severity}</Badge>
                      {r.outcome && <Badge variant="outline">{r.outcome.replace(/_/g, ' ')}</Badge>}
                    </div>
                    {r.customer_statement && <p className="text-sm text-slate-600 mt-1">"{r.customer_statement}"</p>}
                    {r.resolution && <p className="text-sm text-slate-500 mt-1">Resolution: {r.resolution}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>Due: {r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}</span>
                      {r.rep_close_loop_required && !r.rep_close_loop_completed_at && <Badge className="bg-orange-100 text-orange-700 text-xs">Close-loop pending</Badge>}
                      {r.rep_close_loop_completed_at && <Badge className="bg-[#B8956A] text-[#1A1A1A] text-xs">✓ Loop closed</Badge>}
                    </div>
                  </div>
                  {(r.status === "OPEN" || r.status === "IN_PROGRESS") && (
                    <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] shrink-0" onClick={() => setLogging(r)}>
                      Log Outcome
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecoveryForm({ onSave, onCancel }) {
  const [data, setData] = useState({ contact_id: "", customer_name: "", order_id: "", severity: "MINOR", customer_statement: "", outcome: "MET_EXPECTATIONS" });
  const set = (k, v) => setData({ ...data, [k]: v });
  return (
    <Card className="p-6 mb-4 bg-white border-[#B8956A]/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#1A1A1A]">New Post-Service Follow-Up</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>
      <div className="p-3 bg-slate-50 rounded-lg mb-4 text-sm text-slate-600 italic">{POST_SERVICE_SCRIPT}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Customer Name</label>
          <Input value={data.customer_name} onChange={e => set("customer_name", e.target.value)} placeholder="Customer name" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Contact ID (optional)</label>
          <Input value={data.contact_id} onChange={e => set("contact_id", e.target.value)} placeholder="Contact ID" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Order ID (optional)</label>
          <Input value={data.order_id} onChange={e => set("order_id", e.target.value)} placeholder="Deal/Order ID" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Severity</label>
          <Select value={data.severity} onValueChange={v => set("severity", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["MINOR", "MAJOR", "CRITICAL"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Initial Outcome</label>
          <Select value={data.outcome} onValueChange={v => set("outcome", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{POST_SERVICE_OUTCOMES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600 mb-1 block">Customer Statement / Notes</label>
          <Textarea value={data.customer_statement} onChange={e => set("customer_statement", e.target.value)} rows={3} placeholder="What did the customer say?" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={!data.customer_name} onClick={() => onSave(data)}>Create Follow-Up</Button>
      </div>
    </Card>
  );
}

function OutcomeForm({ recovery, onLog, onCancel }) {
  const [outcome, setOutcome] = useState("MET_EXPECTATIONS");
  const [notes, setNotes] = useState("");
  const isIssue = outcome === "MINOR_ISSUE" || outcome === "MAJOR_ISSUE";
  return (
    <div>
      <p className="text-sm font-medium text-slate-600 mb-3">Log outcome for {recovery.customer_name}</p>
      <div className="mb-3">
        <label className="text-sm font-medium text-slate-600 mb-1 block">Outcome</label>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{POST_SERVICE_OUTCOMES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="mb-3">
        <label className="text-sm font-medium text-slate-600 mb-1 block">Notes / Resolution</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={isIssue ? "Describe the issue and resolution..." : "How did the service meet expectations?"} />
      </div>
      {isIssue && (
        <div className="p-3 bg-red-50 rounded-lg mb-3">
          <p className="text-xs font-medium text-red-700 mb-1">Recovery Protocol: {RECOVERY_PROTOCOL.join(" → ")}</p>
          <p className="text-xs text-red-600">Do not promise refunds, reshoots, or discounts. Escalate and document.</p>
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => onLog(recovery, outcome, notes)}>Save Outcome</Button>
      </div>
    </div>
  );
}