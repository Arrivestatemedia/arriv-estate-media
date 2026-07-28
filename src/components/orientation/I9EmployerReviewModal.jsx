import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, RotateCcw, XCircle } from "lucide-react";

const DOC_LIST_A = ["U.S. Passport", "Permanent Resident Card", "Employment Authorization Document"];
const DOC_LIST_B = ["Driver's License", "State ID", "School ID"];
const DOC_LIST_C = ["SSN Card", "Birth Certificate", "Employment Authorization"];

export default function I9EmployerReviewModal({ orientation, onClose, onDone }) {
  const [docA, setDocA] = useState("");
  const [docB, setDocB] = useState("");
  const [docC, setDocC] = useState("");
  const [reverificationDate, setReverificationDate] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const act = async (action) => {
    setBusy(action); setError("");
    try {
      const extra = action === "i9_complete"
        ? { i9_document_list_a: docA, i9_document_list_b: docB, i9_document_list_c: docC, i9_reverification_date: reverificationDate || undefined }
        : action === "i9_reverification" ? { i9_reverification_date: reverificationDate || undefined } : {};
      const res = await base44.functions.invoke("adminReviewOrientation", { orientation_id: orientation.id, action, ...extra });
      if (res.data?.success) { onDone(); onClose(); }
      else setError(res.data?.error || "Action failed.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1A1A1A]"><ShieldCheck className="w-4 h-4 text-[#B8956A]" /> I-9 Employer Verification</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-[#1A1A1A]/80">
          <p className="text-xs">Employee: <strong>{orientation.employee_name}</strong> · {orientation.arriv_employee_id}</p>
          <p className="text-xs">Current I-9 status: <strong>{(orientation.i9_status || "").replace(/_/g, " ")}</strong></p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <Label className="text-xs">List A (identity & work authorization)</Label>
              <Input value={docA} onChange={(e) => setDocA(e.target.value)} placeholder="e.g. U.S. Passport" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">List B (identity)</Label>
                <Input value={docB} onChange={(e) => setDocB(e.target.value)} placeholder="e.g. Driver's License" />
              </div>
              <div>
                <Label className="text-xs">List C (work authorization)</Label>
                <Input value={docC} onChange={(e) => setDocC(e.target.value)} placeholder="e.g. SSN Card" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Reverification date (optional — for temporary work auth)</Label>
              <Input type="date" value={reverificationDate} onChange={(e) => setReverificationDate(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-[#1A1A1A]/50">Only authorized Arriv personnel may complete the employer section. This is recorded in the audit trail.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => act("i9_complete")} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            {busy === "i9_complete" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />} Complete Employer Review
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("i9_reverification")}>
            {busy === "i9_reverification" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />} Reverification Required
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("i9_reject")}>
            {busy === "i9_reject" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />} Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}