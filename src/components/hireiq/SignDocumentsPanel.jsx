import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, FileText, Send, Trash2, Edit, Eye, Ban, CheckCircle2, Clock, XCircle, AlertCircle, Search } from "lucide-react";
import SignDocumentEditorModal from "./SignDocumentEditorModal";
import SendSignRequestModal from "./SendSignRequestModal";
import SignedDocumentViewer from "./SignedDocumentViewer";

const STATUS_CONFIG = {
  sent: { label: "Sent", icon: Send, color: "text-slate-600 bg-slate-100" },
  viewed: { label: "Viewed", icon: Eye, color: "text-blue-600 bg-blue-50" },
  signed: { label: "Signed", icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  declined: { label: "Declined", icon: XCircle, color: "text-red-600 bg-red-50" },
  voided: { label: "Voided", icon: Ban, color: "text-slate-500 bg-slate-100" },
  expired: { label: "Expired", icon: Clock, color: "text-amber-600 bg-amber-50" },
};

export default function SignDocumentsPanel({ salesMemberId }) {
  const [tab, setTab] = useState("templates");
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendDocId, setSendDocId] = useState(null);
  const [viewingSigned, setViewingSigned] = useState(null);

  const activeRequests = (showArchived ? requests : requests.filter(r => r.status !== "voided")).filter(r => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.candidate_name || "").toLowerCase().includes(q) ||
      (r.candidate_email || "").toLowerCase().includes(q) ||
      (r.document_title || "").toLowerCase().includes(q)
    );
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, reqsRes] = await Promise.all([
        base44.functions.invoke("manageSignDocuments", { action: "list", sales_member_id: salesMemberId }),
        base44.functions.invoke("manageSignDocuments", { action: "list_requests", sales_member_id: salesMemberId }),
      ]);
      const docsData = docsRes?.data ?? docsRes;
      const reqsData = reqsRes?.data ?? reqsRes;
      setDocuments(docsData?.documents || []);
      setRequests(reqsData?.requests || []);
    } catch (e) {
      console.error("Failed to load sign data:", e);
    } finally {
      setLoading(false);
    }
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeleteDoc = async (doc) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await base44.functions.invoke("manageSignDocuments", { action: "delete", id: doc.id, sales_member_id: salesMemberId });
      loadData();
    } catch (e) {
      alert(e.message || "Failed to delete");
    }
  };

  const handleToggleActive = async (doc) => {
    try {
      await base44.functions.invoke("manageSignDocuments", { action: "update", id: doc.id, active: !doc.active, sales_member_id: salesMemberId });
      loadData();
    } catch (e) {
      alert(e.message || "Failed to update");
    }
  };

  const handleVoidRequest = async (req) => {
    if (!confirm(`Void the sign request for ${req.candidate_name}?`)) return;
    try {
      await base44.functions.invoke("manageSignDocuments", { action: "void_request", id: req.id, sales_member_id: salesMemberId });
      loadData();
    } catch (e) {
      alert(e.message || "Failed to void");
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "templates" ? "border-[#B8956A] text-[#B8956A]" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "requests" ? "border-[#B8956A] text-[#B8956A]" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Sent Requests
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
        </div>
      ) : tab === "templates" ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">{documents.length} document template{documents.length !== 1 ? "s" : ""}</p>
            <Button onClick={() => { setEditingDoc(null); setEditorOpen(true); }} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
              <Plus className="w-4 h-4 mr-2" /> New Document
            </Button>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">No document templates yet. Create one to start sending for signature.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => {
                const fieldCount = (doc.signature_fields || []).length;
                return (
                  <div key={doc.id} className="border border-slate-200 rounded-lg p-4 hover:border-[#B8956A]/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-semibold text-[#1A1A1A] truncate">{doc.title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${doc.active ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                            {doc.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          {doc.document_type?.replace(/_/g, " ")} · {doc.source_type === "upload" ? "PDF Upload" : "Rich-Text Editor"} · v{doc.version}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{fieldCount} signature field{fieldCount !== 1 ? "s" : ""}</p>
                      </div>
                      <button onClick={() => handleDeleteDoc(doc)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 shrink-0" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => { setSendDocId(doc.document_id); setSendModalOpen(true); }}
                        disabled={!doc.active}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                      <button
                        onClick={() => { setEditingDoc(doc); setEditorOpen(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(doc)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
                      >
                        {doc.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by candidate or document..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md bg-white text-[#1A1A1A] placeholder:text-slate-400 focus:outline-none focus:border-[#B8956A] focus:ring-1 focus:ring-[#B8956A]/40"
              />
            </div>
            <div className="flex items-center gap-4 sm:ml-auto">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#B8956A] focus:ring-[#B8956A]"
                />
                Show archived
              </label>
              <Button onClick={() => setSendModalOpen(true)} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                <Send className="w-4 h-4 mr-2" /> Send New Request
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-3">{activeRequests.length} sign request{activeRequests.length !== 1 ? "s" : ""}</p>

          {activeRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Send className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">No sign requests sent yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRequests.map(req => {
                const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.sent;
                const SIcon = sc.icon;
                const isVoided = req.status === "voided";
                return (
                  <div key={req.id} className={`border border-slate-200 rounded-lg p-4 flex items-center justify-between hover:border-[#B8956A]/30 transition-colors ${isVoided ? "opacity-60" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium text-[#1A1A1A] truncate ${isVoided ? "line-through" : ""}`}>{req.document_title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${sc.color}`}>
                          <SIcon className="w-3 h-3" /> {sc.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {req.candidate_name} · {req.candidate_email}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Sent {formatDate(req.sent_at)}
                        {req.signed_at && ` · Signed ${formatDate(req.signed_at)}`}
                        {req.declined_at && ` · Declined ${formatDate(req.declined_at)}`}
                        {req.voided_at && ` · Voided ${formatDate(req.voided_at)}`}
                      </p>
                    </div>
                    {req.status === "signed" && (
                      <button
                        onClick={() => setViewingSigned(req)}
                        className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-[#B8956A]/10 text-[#B8956A] hover:bg-[#B8956A]/20 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                    )}
                    {!["signed", "voided", "declined", "expired"].includes(req.status) && (
                      <button onClick={() => handleVoidRequest(req)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Void">
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editorOpen && (
        <SignDocumentEditorModal
          existing={editingDoc}
          salesMemberId={salesMemberId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); loadData(); }}
        />
      )}
      {sendModalOpen && (
        <SendSignRequestModal
          salesMemberId={salesMemberId}
          preselectedDocumentId={sendDocId}
          onClose={() => { setSendModalOpen(false); setSendDocId(null); }}
          onSent={() => { setSendModalOpen(false); setSendDocId(null); loadData(); }}
        />
      )}
      {viewingSigned && (
        <SignedDocumentViewer
          open={!!viewingSigned}
          onOpenChange={(v) => { if (!v) setViewingSigned(null); }}
          signRequest={viewingSigned}
        />
      )}
    </div>
  );
}