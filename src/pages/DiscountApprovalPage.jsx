import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, Check, X, Clock, Plus } from "lucide-react";
import { DISCOUNT_STATUS } from "@/lib/salesTrainingData";

const getAdmin = () => ({
  id: localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id') || '',
  name: localStorage.getItem('user_name') || sessionStorage.getItem('user_name') || localStorage.getItem('sales_member_name') || '',
});
const getMember = () => ({
  id: localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id'),
  name: localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name'),
  email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email'),
});

const STATUS_COLORS = {
  PENDING: "bg-orange-100 text-orange-700",
  APPROVED: "bg-[#B8956A] text-[#1A1A1A]",
  DENIED: "bg-red-100 text-red-700",
  EXPIRED: "bg-slate-200 text-slate-600",
};

export default function DiscountApprovalPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("PENDING");
  const [deciding, setDeciding] = useState(null);
  const admin = getAdmin();
  const member = getMember();
  const isAdmin = localStorage.getItem('user_role') === 'admin' || sessionStorage.getItem('user_role') === 'admin' ||
    localStorage.getItem('sales_member_role') === 'admin' || sessionStorage.getItem('sales_member_role') === 'admin';

  const load = useCallback(async () => {
    try {
      const list = isAdmin
        ? await base44.entities.DiscountApproval.list('-requested_at', 200)
        : await base44.entities.DiscountApproval.filter({ sales_member_id: member.id }, '-requested_at', 200);
      setRequests(list || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [isAdmin, member.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "ALL" ? requests : requests.filter(r => r.status === filter);

  const handleDecide = async (req, decision, approvedValue, conditions) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.DiscountApproval.update(req.id, {
        status: decision === "approve" ? "APPROVED" : "DENIED",
        approver_id: admin.id,
        approver_name: admin.name,
        approved_value: decision === "approve" ? approvedValue : undefined,
        conditions: conditions || undefined,
        decided_at: now,
      });
      await base44.entities.AuditEvent.create({
        event_type: decision === "approve" ? "DISCOUNT_APPROVED" : "DISCOUNT_DENIED",
        sales_member_id: req.sales_member_id,
        sales_member_name: req.sales_member_name,
        actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
        entity_type: "DiscountApproval", entity_id: req.id,
        details: { decision, approved_value: approvedValue, conditions },
        timestamp: now,
      });
      setDeciding(null); await load();
    } catch (err) { console.error(err); }
  };

  const handleRequest = async (data) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.DiscountApproval.create({
        ...data,
        sales_member_id: member.id,
        sales_member_name: member.name,
        status: "PENDING",
        requested_at: now,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await base44.entities.AuditEvent.create({
        event_type: "DISCOUNT_REQUESTED",
        sales_member_id: member.id,
        sales_member_name: member.name,
        actor_id: member.id, actor_name: member.name, actor_role: "REP",
        entity_type: "DiscountApproval",
        timestamp: now,
      });
      setShowForm(false); await load();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Discount Approvals</h1>
            <p className="text-slate-600">{isAdmin ? "Review and approve rep discount requests" : "Request discounts that require manager approval"}</p>
          </div>
          {!isAdmin && <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" /> Request Discount</Button>}
        </div>

        <div className="flex gap-2 mb-4">
          {["PENDING", "APPROVED", "DENIED", "ALL"].map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              className={filter === f ? "bg-[#B8956A] text-[#1A1A1A]" : "border-[#B8956A]/30"}
              onClick={() => setFilter(f)}>{f.charAt(0) + f.slice(1).toLowerCase()}</Button>
          ))}
        </div>

        {showForm && <RequestForm onSave={handleRequest} onCancel={() => setShowForm(false)} />}

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center bg-white"><Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No {filter.toLowerCase()} discount requests.</p></Card>
          ) : filtered.map(req => (
            <Card key={req.id} className="p-4 bg-white border-[#B8956A]/15">
              {deciding?.id === req.id ? (
                <DecisionForm req={req} onDecide={handleDecide} onCancel={() => setDeciding(null)} />
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#1A1A1A]">{req.customer_or_prospect_name || "Unknown"}</h3>
                      <Badge className={STATUS_COLORS[req.status]}>{req.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">{req.requested_discount_type?.replace(/_/g, ' ')}</span> of ${req.requested_value}
                      {req.approved_value !== undefined && req.status === "APPROVED" && <span className="text-[#B8956A]"> → Approved: ${req.approved_value}</span>}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Reason: {req.reason}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>Rep: {req.sales_member_name}</span>
                      <span>•</span>
                      <Clock className="w-3 h-3" /><span>{new Date(req.requested_at).toLocaleDateString()}</span>
                      {req.conditions && <><span>•</span><span className="text-[#B8956A]">Conditions: {req.conditions}</span></>}
                    </div>
                  </div>
                  {isAdmin && req.status === "PENDING" && (
                    <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setDeciding(req)}>Review</Button>
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

function RequestForm({ onSave, onCancel }) {
  const [data, setData] = useState({ customer_or_prospect_name: "", requested_discount_type: "PERCENTAGE", requested_value: 0, reason: "" });
  const set = (k, v) => setData({ ...data, [k]: v });
  return (
    <Card className="p-6 mb-4 bg-white border-[#B8956A]/30">
      <h3 className="font-bold text-[#1A1A1A] mb-4">Request Discount Approval</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Customer / Prospect Name</label>
          <Input value={data.customer_or_prospect_name} onChange={e => set("customer_or_prospect_name", e.target.value)} placeholder="Customer name" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Discount Type</label>
          <Select value={data.requested_discount_type} onValueChange={v => set("requested_discount_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["PERCENTAGE", "FLAT_AMOUNT", "FREE_ADDON", "OTHER"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Requested Value</label>
          <Input type="number" value={data.requested_value} onChange={e => set("requested_value", Number(e.target.value))} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-medium text-slate-600 mb-1 block">Reason</label>
          <Textarea value={data.reason} onChange={e => set("reason", e.target.value)} rows={2} placeholder="Why is this discount needed?" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={!data.customer_or_prospect_name || !data.reason} onClick={() => onSave(data)}>Submit Request</Button>
      </div>
    </Card>
  );
}

function DecisionForm({ req, onDecide, onCancel }) {
  const [approvedValue, setApprovedValue] = useState(req.requested_value);
  const [conditions, setConditions] = useState("");
  return (
    <div>
      <p className="text-sm text-slate-600 mb-3">Requested: {req.requested_discount_type?.replace(/_/g, ' ')} of ${req.requested_value} for {req.customer_or_prospect_name}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Approved Value</label>
          <Input type="number" value={approvedValue} onChange={e => setApprovedValue(Number(e.target.value))} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Conditions</label>
          <Input value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Any conditions..." />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={() => onDecide(req, "deny", 0, conditions)}><X className="w-4 h-4 mr-1" /> Deny</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => onDecide(req, "approve", approvedValue, conditions)}><Check className="w-4 h-4 mr-1" /> Approve</Button>
      </div>
    </div>
  );
}