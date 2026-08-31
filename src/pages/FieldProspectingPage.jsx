import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Search, ExternalLink, CheckCircle2, X } from "lucide-react";
import { LEAD_SOURCE_TYPES, PROSPECT_TYPES, PROFESSIONAL_VIDEO_STATUS } from "@/lib/salesTrainingData";

const getMember = () => ({
  id: localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id'),
  name: localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name'),
  email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email'),
});

const VIDEO_STATUS_COLORS = {
  UNKNOWN: "bg-slate-200 text-slate-700",
  NO_PROFESSIONAL_VIDEO: "bg-[#B8956A] text-[#1A1A1A]",
  PROFESSIONAL_VIDEO_PRESENT: "bg-slate-300 text-slate-700",
  COMING_SOON_NO_MEDIA: "bg-blue-100 text-blue-700",
  MEDIA_NOT_YET_VERIFIABLE: "bg-orange-100 text-orange-700",
};

const QUAL_STATUS_COLORS = {
  UNQUALIFIED: "bg-slate-200 text-slate-700",
  PENDING: "bg-orange-100 text-orange-700",
  QUALIFIED: "bg-[#B8956A] text-[#1A1A1A]",
  DISQUALIFIED: "bg-red-100 text-red-700",
};

export default function FieldProspectingPage() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const member = getMember();

  const load = useCallback(async () => {
    if (!member.id) return;
    try {
      const list = await base44.entities.FieldProspect.filter({ sales_member_id: member.id }, '-date_found', 200);
      setProspects(list || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [member.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "ALL" ? prospects : prospects.filter(p => p.qualification_status === filter);

  const handleSave = async (data) => {
    try {
      if (editing?.id) {
        await base44.entities.FieldProspect.update(editing.id, data);
      } else {
        await base44.entities.FieldProspect.create({ ...data, sales_member_id: member.id, sales_member_email: member.email });
      }
      setShowForm(false); setEditing(null); await load();
    } catch (err) { console.error(err); }
  };

  const handleConvert = async (prospect) => {
    try {
      const contact = await base44.entities.Contact.create({
        firstname: prospect.public_agent_name?.split(' ')[0] || "",
        lastname: prospect.public_agent_name?.split(' ').slice(1).join(' ') || "",
        company: prospect.brokerage || "",
        sales_member_id: member.id,
        lead_status: "NEW",
        lifecycle_stage: "lead",
      });
      await base44.entities.FieldProspect.update(prospect.id, { converted_to_crm: true, contact_id: contact.id, qualification_status: "QUALIFIED" });
      await load();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  if (!member.id) return <div className="p-8 text-center text-slate-500">Please log in.</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Field Prospecting</h1>
            <p className="text-slate-600">Log and research field and digital prospects</p>
          </div>
          <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Prospect
          </Button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {["ALL", "PENDING", "QUALIFIED", "UNQUALIFIED", "DISQUALIFIED"].map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              className={filter === f ? "bg-[#B8956A] text-[#1A1A1A] whitespace-nowrap" : "border-[#B8956A]/30 whitespace-nowrap"}
              onClick={() => setFilter(f)}>
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {showForm && <ProspectForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />}

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="p-8 text-center bg-white"><MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">No prospects yet. Click "Add Prospect" to log your first field or digital lead.</p></Card>
          ) : filtered.map(p => (
            <Card key={p.id} className="p-4 bg-white border-[#B8956A]/15">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[#1A1A1A]">{p.public_agent_name || "Unknown Agent"}</h3>
                    <Badge className={QUAL_STATUS_COLORS[p.qualification_status] || QUAL_STATUS_COLORS.PENDING}>{p.qualification_status}</Badge>
                    <Badge className={VIDEO_STATUS_COLORS[p.professional_video_status] || VIDEO_STATUS_COLORS.UNKNOWN}>{p.professional_video_status?.replace(/_/g, ' ')}</Badge>
                  </div>
                  <p className="text-sm text-slate-500">{p.brokerage || p.builder_developer || ""} {p.property_address || p.approximate_location ? `• ${p.property_address || p.approximate_location}` : ""}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>{p.source_type?.replace(/_/g, ' ')}</span>
                    <span>•</span>
                    <span>{p.prospect_type?.replace(/_/g, ' ')}</span>
                    <span>•</span>
                    <span>{p.date_found}</span>
                    {p.listing_url && <><span>•</span><a href={p.listing_url} target="_blank" rel="noopener" className="text-[#B8956A] hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Listing</a></>}
                  </div>
                  {p.notes && <p className="text-sm text-slate-600 mt-2">{p.notes}</p>}
                  {p.next_action && <p className="text-xs text-[#B8956A] mt-2 font-medium">Next: {p.next_action} {p.next_action_due_date ? `(due ${p.next_action_due_date})` : ""}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!p.converted_to_crm && p.qualification_status === "QUALIFIED" && (
                    <Button size="sm" variant="outline" className="border-[#B8956A]/30 text-[#B8956A]" onClick={() => handleConvert(p)}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Convert to CRM
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setShowForm(true); }}>Edit</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProspectForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState({
    source_type: initial?.source_type || "LOCAL_SIGN",
    prospect_type: initial?.prospect_type || "INDIVIDUAL_AGENT",
    date_found: initial?.date_found || new Date().toISOString().split('T')[0],
    property_address: initial?.property_address || "",
    approximate_location: initial?.approximate_location || "",
    sign_type: initial?.sign_type || "",
    public_agent_name: initial?.public_agent_name || "",
    brokerage: initial?.brokerage || "",
    builder_developer: initial?.builder_developer || "",
    listing_stage: initial?.listing_stage || "UNKNOWN",
    professional_video_status: initial?.professional_video_status || "UNKNOWN",
    listing_url: initial?.listing_url || "",
    notes: initial?.notes || "",
    qualification_status: initial?.qualification_status || "PENDING",
    next_action: initial?.next_action || "",
    next_action_due_date: initial?.next_action_due_date || "",
    is_field_prospecting: initial?.is_field_prospecting ?? true,
  });

  const set = (k, v) => setData({ ...data, [k]: v });

  return (
    <Card className="p-6 mb-4 bg-white border-[#B8956A]/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#1A1A1A]">{initial?.id ? "Edit Prospect" : "New Prospect"}</h3>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Source Type</label>
          <Select value={data.source_type} onValueChange={v => set("source_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{LEAD_SOURCE_TYPES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Prospect Type</label>
          <Select value={data.prospect_type} onValueChange={v => set("prospect_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PROSPECT_TYPES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Date Found</label>
          <Input type="date" value={data.date_found} onChange={e => set("date_found", e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Agent Name</label>
          <Input value={data.public_agent_name} onChange={e => set("public_agent_name", e.target.value)} placeholder="Public agent name" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Brokerage</label>
          <Input value={data.brokerage} onChange={e => set("brokerage", e.target.value)} placeholder="Brokerage name" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Property Address / Location</label>
          <Input value={data.property_address} onChange={e => set("property_address", e.target.value)} placeholder="Property address or approximate location" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Listing Stage</label>
          <Select value={data.listing_stage} onValueChange={v => set("listing_stage", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["COMING_SOON", "ACTIVE", "UNDER_CONTRACT", "SOLD", "EXPIRED", "UNKNOWN"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Professional Video Status</label>
          <Select value={data.professional_video_status} onValueChange={v => set("professional_video_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.values(PROFESSIONAL_VIDEO_STATUS).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Listing URL</label>
          <Input value={data.listing_url} onChange={e => set("listing_url", e.target.value)} placeholder="https://" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Qualification Status</label>
          <Select value={data.qualification_status} onValueChange={v => set("qualification_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["UNQUALIFIED", "PENDING", "QUALIFIED", "DISQUALIFIED"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Next Action</label>
          <Input value={data.next_action} onChange={e => set("next_action", e.target.value)} placeholder="e.g. Call agent" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600 mb-1 block">Next Action Due Date</label>
          <Input type="date" value={data.next_action_due_date} onChange={e => set("next_action_due_date", e.target.value)} />
        </div>
      </div>
      <div className="mt-4">
        <label className="text-sm font-medium text-slate-600 mb-1 block">Notes</label>
        <Textarea value={data.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Research notes, observations..." />
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => onSave(data)}>Save Prospect</Button>
      </div>
    </Card>
  );
}