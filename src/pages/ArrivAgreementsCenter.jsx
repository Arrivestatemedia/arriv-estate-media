import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Plus, Search, Loader2, PenTool, CheckCircle2, Clock,
  XCircle, Eye, Download, Send, Ban, RefreshCw, FileCheck, Users,
} from "lucide-react";
import CreateAgreementModal from "@/components/agreements/CreateAgreementModal";

const STATUS_COLORS = {
  DRAFT: "bg-gray-100 text-gray-700",
  PREPARING: "bg-blue-100 text-blue-700",
  READY_TO_SEND: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-amber-100 text-amber-700",
  OPENED: "bg-blue-100 text-blue-700",
  VIEWING: "bg-blue-100 text-blue-700",
  SIGNING: "bg-[#B8956A]/20 text-[#B8956A]",
  PARTIALLY_SIGNED: "bg-[#B8956A]/20 text-[#B8956A]",
  COMPLETED: "bg-[#B8956A] text-[#1A1A1A]",
  DECLINED: "bg-red-100 text-red-700",
  VOIDED: "bg-gray-200 text-gray-600",
  EXPIRED: "bg-gray-200 text-gray-600",
};

export default function ArrivAgreementsCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      const res = await base44.functions.invoke("getAdminAgreementCenter", { filters, limit: 100, sales_member_id: salesMemberId });
      const d = res?.data || res;
      setData(d);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadDetail = async (agreementId) => {
    setDetailLoading(true);
    try {
      const res = await base44.functions.invoke("getAgreementStatus", { agreement_id: agreementId });
      const d = res?.data || res;
      setDetailData(d);
    } catch (e) {
      console.error(e);
    }
    setDetailLoading(false);
  };

  const sendAgreement = async (agreementId) => {
    try {
      await base44.functions.invoke("manageSignDocuments", { action: "send_reminder", id: selectedAgreement?.id });
      loadData();
    } catch (e) {
      alert(e.message);
    }
  };

  const voidAgreement = async (agreementId) => {
    if (!confirm("Void this agreement? This cannot be undone.")) return;
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      await base44.functions.invoke("manageSignDocuments", { action: "void_request", id: selectedAgreement?.id, sales_member_id: salesMemberId });
      loadData();
      setSelectedAgreement(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const sendReminder = async (agreementId, recipientId) => {
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      await base44.functions.invoke("manageSignDocuments", { action: "send_reminder", id: selectedAgreement?.id, sales_member_id: salesMemberId });
      if (selectedAgreement) loadDetail(selectedAgreement.id);
    } catch (e) {
      alert(e.message);
    }
  };

  const agreements = data?.agreements || [];
  const templates = data?.templates || [];

  const filtered = agreements.filter(a => {
    if (search) {
      const s = search.toLowerCase();
      if (!a.name?.toLowerCase().includes(s) && !a.organization_name?.toLowerCase().includes(s) && !a.sales_rep_email?.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const byStatus = (status) => filtered.filter(a => a.status === status);
  const drafts = byStatus("DRAFT").concat(byStatus("PREPARING"), byStatus("READY_TO_SEND"));
  const awaiting = byStatus("SENT").concat(byStatus("DELIVERED"), byStatus("OPENED"), byStatus("VIEWING"), byStatus("SIGNING"), byStatus("PARTIALLY_SIGNED"));
  const completed = byStatus("COMPLETED");
  const declined = byStatus("DECLINED");
  const voided = byStatus("VOIDED").concat(byStatus("EXPIRED"));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-[#1A1A1A]">Arriv Agreements</h1>
          <p className="text-sm text-[#1A1A1A]/50">Contract generation, e-signature, and document execution</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
            <Plus className="w-4 h-4 mr-1" /> New Agreement
          </Button>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#1A1A1A]/40" />
        <Input
          className="pl-9"
          placeholder="Search by name, organization, or sales rep..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
          <TabsTrigger value="awaiting">Awaiting ({awaiting.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {loading ? <LoadingState /> : <AgreementList agreements={filtered} onSelect={(a) => { setSelectedAgreement(a); loadDetail(a.id); }} />}
        </TabsContent>
        <TabsContent value="drafts">
          <AgreementList agreements={drafts} onSelect={(a) => { setSelectedAgreement(a); loadDetail(a.id); }} />
        </TabsContent>
        <TabsContent value="awaiting">
          <AgreementList agreements={awaiting} onSelect={(a) => { setSelectedAgreement(a); loadDetail(a.id); }} />
        </TabsContent>
        <TabsContent value="completed">
          <AgreementList agreements={completed} onSelect={(a) => { setSelectedAgreement(a); loadDetail(a.id); }} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplateList templates={templates} />
        </TabsContent>
      </Tabs>

      {selectedAgreement && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelectedAgreement(null)}>
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>
            ) : detailData ? (
              <AgreementDetail
                agreement={detailData.agreement}
                recipients={detailData.recipients}
                events={detailData.events}
                onSend={() => sendAgreement(selectedAgreement.id)}
                onVoid={() => voidAgreement(selectedAgreement.id)}
                onRemind={(rid) => sendReminder(selectedAgreement.id, rid)}
              />
            ) : <p className="text-[#1A1A1A]/40">Failed to load</p>}
          </div>
        </div>
      )}

      <CreateAgreementModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); loadData(); }}
        salesMemberId={localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id')}
        salesRepEmail={localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email')}
      />
    </div>
  );
}

function LoadingState() {
  return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>;
}

function AgreementList({ agreements, onSelect }) {
  if (agreements.length === 0) return <p className="text-center text-[#1A1A1A]/40 py-8">No agreements</p>;
  return (
    <div className="space-y-2">
      {agreements.map(a => (
        <Card key={a.id} className="cursor-pointer hover:border-[#B8956A] transition-colors" onClick={() => onSelect(a)}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#1A1A1A] truncate">{a.name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge className={STATUS_COLORS[a.status] || 'bg-gray-100'} variant="secondary">
                    {a.status.replace(/_/g, ' ')}
                  </Badge>
                  {a.organization_name && <span className="text-xs text-[#1A1A1A]/50">{a.organization_name}</span>}
                  {a.required_count > 0 && (
                    <span className="text-xs text-[#1A1A1A]/50">{a.completed_count}/{a.required_count} signed</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {a.recipient_summary?.some(r => r.is_viewing_now) && (
                  <span className="flex items-center gap-1 text-xs text-blue-600"><Eye className="w-3 h-3" /> viewing</span>
                )}
                {a.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4 text-[#B8956A]" />}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TemplateList({ templates }) {
  if (templates.length === 0) return <p className="text-center text-[#1A1A1A]/40 py-8">No active templates</p>;
  return (
    <div className="space-y-2">
      {templates.map(t => (
        <Card key={t.id}>
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-[#1A1A1A]">{t.name}</p>
              <p className="text-xs text-[#1A1A1A]/50">{t.category.replace(/_/g, ' ')} · v{t.current_version_number} · {t.document_type}</p>
            </div>
            <FileText className="w-5 h-5 text-[#B8956A]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgreementDetail({ agreement, recipients, events, onSend, onVoid, onRemind }) {
  const isTerminal = ['COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED'].includes(agreement.status);
  const canSend = ['DRAFT', 'PREPARING', 'READY_TO_SEND'].includes(agreement.status);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-serif text-[#1A1A1A]">{agreement.name}</h2>
        <Badge className={STATUS_COLORS[agreement.status] || 'bg-gray-100'} variant="secondary">
          {agreement.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      <div>
        <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-2">Recipients</h3>
        <div className="space-y-2">
          {recipients.map(r => (
            <div key={r.recipient_id} className="flex items-center justify-between p-2 bg-[#FFFBF5] rounded-lg">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{r.name}</p>
                <p className="text-xs text-[#1A1A1A]/50">{r.email} · {r.role}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.is_viewing_now && <span className="text-xs text-blue-600 flex items-center gap-1"><Eye className="w-3 h-3" /> live</span>}
                <Badge variant="outline" className="text-xs">{r.status.replace(/_/g, ' ')}</Badge>
                {!isTerminal && ['PENDING', 'NOTIFIED', 'DELIVERED', 'OPENED'].includes(r.status) && (
                  <Button size="sm" variant="ghost" onClick={() => onRemind(r.recipient_id)}>
                    <Send className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {canSend && (
          <Button onClick={onSend} className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1">
            <Send className="w-4 h-4 mr-1" /> Send for Signature
          </Button>
        )}
        {!isTerminal && (
          <Button onClick={onVoid} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
            <Ban className="w-4 h-4 mr-1" /> Void
          </Button>
        )}
      </div>

      {events && events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-2">Activity</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {events.slice().reverse().map((e, i) => (
              <div key={i} className="text-xs text-[#1A1A1A]/60 flex gap-2">
                <span className="text-[#B8956A]">●</span>
                <span>{e.event_type.replace(/_/g, ' ')}</span>
                <span className="text-[#1A1A1A]/30">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}