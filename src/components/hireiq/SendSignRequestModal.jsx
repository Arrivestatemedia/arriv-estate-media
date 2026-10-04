import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, X, Send, Search, User, Mail, Users, Plus, Trash2 } from "lucide-react";

// Send-for-signature modal. Two primary tabs — Pick Applicant and Free-Form
// Email — matching the Khetha IQ reference. Multi-signer stays available via
// a small link under the toggle. When opened from a template card the
// document is preselected and its title shows in the header.
export default function SendSignRequestModal({ onClose, onSent, salesMemberId, preselectedDocumentId }) {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState(preselectedDocumentId || "");
  const [recipientMode, setRecipientMode] = useState("applicant"); // "applicant" | "manual" | "multi"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [multiRecipients, setMultiRecipients] = useState([{ name: "", email: "" }]);
  const [requireOrder, setRequireOrder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadDocuments(); }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) searchApplicants();
    else setSearchResults([]);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await base44.functions.invoke("manageSignDocuments", { action: "list", sales_member_id: salesMemberId });
      const data = res?.data ?? res;
      const docs = (data?.documents || []).filter(d => d.active);
      setDocuments(docs);
      if (preselectedDocumentId) setSelectedDocId(preselectedDocumentId);
      else if (docs.length > 0) setSelectedDocId(docs[0].document_id);
    } catch (e) {
      setError(e.message || "Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  };

  const searchApplicants = async () => {
    setSearching(true);
    try {
      const results = await base44.entities.JobApplication.filter({});
      const all = Array.isArray(results) ? results : (results?.data || []);
      const q = searchQuery.toLowerCase();
      setSearchResults(all.filter(a =>
        (a.full_name || "").toLowerCase().includes(q) || (a.email || "").toLowerCase().includes(q)
      ).slice(0, 10));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectedDoc = documents.find(d => d.document_id === selectedDocId);
  const showDocPicker = !preselectedDocumentId && documents.length > 1;

  const handleSend = async () => {
    if (!selectedDocId) return setError("Please select a document");
    setSending(true);
    setError("");
    try {
      const payload = { document_id: selectedDocId, sales_member_id: salesMemberId };
      if (recipientMode === "applicant") {
        if (!selectedApp) return setError("Please select an applicant");
        payload.application_id = selectedApp.id;
      } else if (recipientMode === "manual") {
        if (!manualEmail.trim()) return setError("Please enter a recipient email");
        payload.recipient_email = manualEmail.trim();
        payload.recipient_name = manualName.trim();
      } else if (recipientMode === "multi") {
        const valid = multiRecipients.filter(r => r.email.trim());
        if (valid.length < 2) return setError("Add at least 2 recipients for multi-signer");
        payload.recipients = valid.map(r => ({ email: r.email.trim(), name: r.name.trim() }));
        payload.require_signing_order = requireOrder;
      }
      const res = await base44.functions.invoke("sendSignRequest", payload);
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      onSent?.(data);
    } catch (e) {
      setError(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const TabButton = ({ mode, icon: Icon, label }) => (
    <button
      onClick={() => setRecipientMode(mode)}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${
        recipientMode === mode
          ? "bg-[#B8956A] text-white border-[#B8956A]"
          : "bg-white text-slate-600 border-slate-200 hover:border-[#B8956A]/40"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            {selectedDoc ? `Send '${selectedDoc.title}'` : "Send for Signature"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {showDocPicker && (
            <div>
              <Label className="text-sm font-medium text-slate-700">Document</Label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {documents.map(d => <option key={d.document_id} value={d.document_id}>{d.title}</option>)}
              </select>
            </div>
          )}
          {loadingDocs && !preselectedDocumentId && (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading documents...</p>
          )}

          {/* Recipient toggle */}
          <div>
            <Label className="text-sm font-medium text-slate-700 mb-1.5 block">Recipient</Label>
            <div className="flex gap-2">
              <TabButton mode="applicant" icon={User} label="Pick Applicant" />
              <TabButton mode="manual" icon={Mail} label="Free-Form Email" />
            </div>
            {recipientMode !== "multi" && (
              <button
                onClick={() => setRecipientMode("multi")}
                className="mt-2 text-xs text-[#B8956A] hover:underline flex items-center gap-1"
              >
                <Users className="w-3.5 h-3.5" /> Send to multiple signers
              </button>
            )}
          </div>

          {recipientMode === "applicant" && (
            <div>
              <Label className="text-sm font-medium text-slate-700">Search Applicant</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search applicants..."
                  className="pl-10"
                />
              </div>
              {searching && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching...</p>}
              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && !selectedApp && (
                <p className="text-sm text-slate-400 text-center py-6">No applicants found</p>
              )}
              {searchResults.length > 0 && !selectedApp && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  {searchResults.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { setSelectedApp(app); setSearchQuery(""); setSearchResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-[#B8956A]/10 border-b border-slate-100 last:border-0 transition-colors"
                    >
                      <p className="text-sm font-medium text-[#1A1A1A]">{app.full_name}</p>
                      <p className="text-xs text-slate-500">{app.email}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedApp && (
                <div className="mt-2 p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/30 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{selectedApp.full_name}</p>
                    <p className="text-xs text-slate-500">{selectedApp.email}</p>
                  </div>
                  <button onClick={() => setSelectedApp(null)} className="text-xs text-red-500 hover:underline ml-2 shrink-0">Remove</button>
                </div>
              )}
            </div>
          )}

          {recipientMode === "manual" && (
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Recipient Name</Label>
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="John Doe" className="mt-1.5" />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Recipient Email</Label>
                <Input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="john@example.com" className="mt-1.5" />
              </div>
            </div>
          )}

          {recipientMode === "multi" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700">Multiple Signers</Label>
                <button onClick={() => setRecipientMode("applicant")} className="text-xs text-slate-400 hover:text-slate-600">← back</button>
              </div>
              <p className="text-xs text-slate-500">Each signer gets their own link. Fields with an assigned signer are only visible to that signer.</p>
              {multiRecipients.map((r, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input value={r.name} onChange={(e) => { const n = [...multiRecipients]; n[idx] = { ...n[idx], name: e.target.value }; setMultiRecipients(n); }} placeholder={`Signer ${idx + 1} name`} className="text-sm" />
                    <Input type="email" value={r.email} onChange={(e) => { const n = [...multiRecipients]; n[idx] = { ...n[idx], email: e.target.value }; setMultiRecipients(n); }} placeholder="email@example.com" className="text-sm" />
                  </div>
                  {multiRecipients.length > 2 && (
                    <button onClick={() => setMultiRecipients(multiRecipients.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg mt-1"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setMultiRecipients([...multiRecipients, { name: "", email: "" }])} className="text-sm text-[#B8956A] hover:underline flex items-center gap-1"><Plus className="w-4 h-4" /> Add another signer</button>
              <label className="flex items-center gap-2 text-sm text-slate-600 pt-2">
                <input type="checkbox" checked={requireOrder} onChange={(e) => setRequireOrder(e.target.checked)} className="w-4 h-4 accent-[#B8956A]" />
                Require signing order (signers sign one at a time, in order)
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !selectedDocId} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : <><Send className="w-4 h-4 mr-2" /> Send for Signature</>}
          </Button>
        </div>
      </div>
    </div>
  );
}