import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { packages, addOns, packageNames, computeTotal } from "@/lib/services";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Check, Lock } from "lucide-react";

export default function ConvertToJobModal({ open, onClose, contact, onSent }) {
  const salesMemberId =
    localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");

  const [pkg, setPkg] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [clientName, setClientName] = useState(contact?.name || "");
  const [clientEmail, setClientEmail] = useState(contact?.email || "");
  const [clientPhone, setClientPhone] = useState(contact?.phone || "");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const toggleAddOn = (id) => {
    setSelectedAddOns((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const total = computeTotal(pkg, selectedAddOns);

  const handleSend = async () => {
    if (!pkg) {
      setError("Please choose a package.");
      return;
    }
    if (!clientEmail) {
      setError("Client email is required to send the invite.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await base44.functions.invoke("convertProspectToJob", {
        sales_member_id: salesMemberId,
        contact_name: contact?.name || "",
        contact_email: contact?.email || "",
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        company: contact?.company || "",
        pkg,
        package_name: packageNames[pkg],
        locked_add_ons: selectedAddOns,
        locked_total_price: total,
        notes,
      });
      setResult(res?.data || null);
      if (onSent) onSent(res?.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to send invite");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError("");
    setPkg("");
    setSelectedAddOns([]);
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert Prospect to Job</DialogTitle>
          <DialogDescription>
            Choose services for {contact?.name || contact?.email || "this prospect"}. We'll email
            the client a signup link with everything pre-filled. You'll earn 15% commission on the
            completed job.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-5 h-5" />
              <span className="font-medium">Invite sent!</span>
            </div>
            {result.email_error && (
              <p className="text-xs text-amber-600">
                Email delivery failed, but you can share this link directly: {result.link}
              </p>
            )}
            <div className="rounded-md border p-3 text-sm break-all">
              <p className="text-xs text-muted-foreground mb-1">Signup link:</p>
              <code className="text-xs">{result.link}</code>
            </div>
            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Package</Label>
              <div className="grid grid-cols-2 gap-2">
                {packages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPkg(p.id)}
                    className={`text-left rounded-md border p-3 transition ${
                      pkg === p.id
                        ? "border-[#B8956A] bg-[#B8956A]/10"
                        : "border-input hover:border-[#B8956A]/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">${p.price}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Add-ons</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {addOns.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                  >
                    <span className="text-sm">{a.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">${a.price}</span>
                      <input
                        type="checkbox"
                        checked={selectedAddOns.includes(a.id)}
                        onChange={() => toggleAddOn(a.id)}
                        className="w-4 h-4 accent-[#B8956A]"
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-md bg-[#B8956A]/10 border border-[#B8956A]/30 p-3 flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Client total
              </span>
              <span className="text-lg font-bold text-[#B8956A]">${total}</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Client name</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <Label>Client email *</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div>
                <Label>Client phone</Label>
                <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the client should know..."
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={sending || !salesMemberId}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send invite
              </Button>
            </DialogFooter>
            {!salesMemberId && (
              <p className="text-xs text-amber-600 text-center">Sign in as a sales rep to send invites.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}