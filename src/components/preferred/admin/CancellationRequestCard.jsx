import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail, MessageSquare, XCircle, Ban } from "lucide-react";

// One customer cancellation request, as filed by the concierge, with what was actually delivered.

function when(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Delivery({ label, icon: Icon, at }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${at ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
      <Icon className="h-3 w-3" />
      {label} {at ? "sent" : "not sent"}
    </span>
  );
}

export default function CancellationRequestCard({ request, busy, onCancelMembership, onClose }) {
  return (
    <div className="rounded-2xl border border-[#B8956A]/30 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg text-[#1A1A1A]">{request.client_name || request.client_email}</p>
          <p className="text-xs text-[#1A1A1A]/55">{request.client_email}</p>
          <p className="mt-1 text-[11px] text-[#1A1A1A]/50">
            {String(request.plan || "Preferred").replace(/_/g, " ")} · asked {when(request.created_at)} via{" "}
            {String(request.requested_via || "").replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Delivery label="Email" icon={Mail} at={request.email_sent_at} />
          <Delivery label="Text" icon={MessageSquare} at={request.sms_sent_at} />
        </div>
      </div>

      {request.utterance && (
        <p className="mt-3 rounded-xl bg-[#FFFBF5] px-3 py-2 text-xs italic text-[#1A1A1A]/70">“{request.utterance}”</p>
      )}

      <p className="mt-2 text-[11px] text-[#1A1A1A]/50">
        Advisor on file: {request.sales_rep_name || "none"}{request.sales_rep_email ? ` · ${request.sales_rep_email}` : ""}
      </p>
      {request.notification_error && (
        <p className="mt-1 text-[11px] text-amber-700">Delivery note: {request.notification_error}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onCancelMembership()} disabled={busy} className="border-red-200 text-red-700 hover:bg-red-50">
          {busy ? <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-700" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}
          Cancel membership
        </Button>
        <Button size="sm" variant="outline" onClick={() => onClose("closed")} disabled={busy} className="border-[#1A1A1A]/20 text-[#1A1A1A]/75">
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Kept — close request
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onClose("declined")} disabled={busy} className="text-[#1A1A1A]/45">
          <XCircle className="mr-1.5 h-3.5 w-3.5" /> Decline
        </Button>
      </div>
    </div>
  );
}