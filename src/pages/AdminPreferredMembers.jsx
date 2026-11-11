import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Ban, Loader2, RefreshCw } from "lucide-react";
import CancellationRequestCard from "@/components/preferred/admin/CancellationRequestCard";

// Preferred memberships and the cancellation requests the concierge files.
// Every action is re-authorised on the server; this screen only offers the actions.

function identity() {
  const read = (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  return { sales_member_id: read("sales_member_id"), email: read("sales_member_email") || read("user_email") };
}

function day(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  trialing: "bg-sky-50 text-sky-700 border-sky-200",
  past_due: "bg-amber-50 text-amber-800 border-amber-200",
  canceled: "bg-slate-50 text-slate-600 border-slate-200",
  paused: "bg-slate-50 text-slate-600 border-slate-200",
  incomplete: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AdminPreferredMembers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const call = useCallback(async (payload) => {
    const res = await base44.functions.invoke("adminPreferredMembers", { ...identity(), ...payload });
    return res?.data || res;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await call({ action: "list" });
      if (payload?.ok === false) setError(payload.message || payload.error || "Could not load Preferred memberships.");
      else setData(payload);
    } catch (err) {
      setError(err.message || "Could not load Preferred memberships.");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmCancel = async () => {
    if (!target) return;
    setBusy(target.id);
    setNotice("");
    try {
      const payload = await call({ action: "cancel", membership_id: target.id, reason: reason.trim() || undefined });
      if (payload?.ok) {
        setNotice(payload.note || "Membership cancelled.");
        setTarget(null);
        setReason("");
        await load();
      } else {
        setNotice(payload?.message || payload?.error || "That membership could not be cancelled.");
      }
    } catch (err) {
      setNotice(err.message || "That membership could not be cancelled.");
    } finally {
      setBusy("");
    }
  };

  const closeRequest = async (request, decision) => {
    setBusy(request.request_id);
    setNotice("");
    try {
      const payload = await call({ action: "close", request_id: request.request_id, decision });
      if (payload?.ok) {
        setNotice(decision === "declined" ? "Request declined. The membership is unchanged." : "Request closed. The membership is unchanged.");
        await load();
      } else {
        setNotice(payload?.message || payload?.error || "That request could not be closed.");
      }
    } finally {
      setBusy("");
    }
  };

  const memberships = data?.memberships || [];
  const requests = data?.requests || [];
  const visible = memberships.filter((row) => showCancelled || !["canceled", "expired"].includes(row.status));
  const activeCount = memberships.filter((row) => row.status === "active").length;

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-20">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-[#1A1A1A]">Preferred members</h1>
            <p className="mt-1 text-sm text-[#1A1A1A]/55">
              Memberships, the advisor on file, and every cancellation the concierge has filed.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-[#B8956A]/40 text-[#1A1A1A]">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {notice && <div className="mt-4 rounded-xl border border-[#B8956A]/35 bg-white px-4 py-3 text-sm text-[#1A1A1A]/75">{notice}</div>}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mr-2 inline h-4 w-4" /> {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { label: "Active memberships", value: activeCount },
            { label: "Cancellation requests", value: requests.length },
            { label: "Total memberships", value: memberships.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[#B8956A]/25 bg-white p-4">
              <p className="font-serif text-2xl text-[#1A1A1A]">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/50">{stat.label}</p>
            </div>
          ))}
        </div>

        {requests.length > 0 && (
          <div className="mt-6">
            <h2 className="font-serif text-xl text-[#1A1A1A]">Cancellation requests</h2>
            <p className="mb-3 text-xs text-[#1A1A1A]/50">
              Filed by the concierge and sent to the advisor by email and text. Nothing is cancelled until you cancel it.
            </p>
            <div className="grid gap-3">
              {requests.map((request) => (
                <CancellationRequestCard
                  key={request.request_id}
                  request={request}
                  busy={busy === request.request_id || busy === request.membership_id}
                  onCancelMembership={() => {
                    const membership = memberships.find((row) => row.id === request.membership_id);
                    setTarget(membership || { id: request.membership_id, client_email: request.client_email, client_name: request.client_name });
                  }}
                  onClose={(decision) => closeRequest(request, decision)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-serif text-xl text-[#1A1A1A]">All memberships</h2>
          <label className="flex items-center gap-2 text-xs text-[#1A1A1A]/60">
            <input type="checkbox" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} />
            Show cancelled
          </label>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[#B8956A]/25 bg-white">
          {loading ? (
            <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#B8956A]" /></div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#1A1A1A]/50">No Preferred memberships yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#FFFBF5] text-left text-[10px] uppercase tracking-[0.12em] text-[#1A1A1A]/45">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Plan</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Paid through</th>
                    <th className="px-4 py-2 font-medium">Advisor</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className="border-t border-[#B8956A]/12">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[#1A1A1A]">{row.client_name || row.client_email}</p>
                        <p className="text-[11px] text-[#1A1A1A]/45">{row.client_email}</p>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-[#1A1A1A]/70">
                        {String(row.plan || "preferred").replace(/_/g, " ")}
                        {row.billing_source === "comp" ? <span className="ml-1 text-[10px] text-[#B8956A]">(comp)</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[row.status] || STATUS_STYLES.canceled}`}>
                          {row.status.replace(/_/g, " ")}
                        </span>
                        {row.open_request && <span className="ml-1 text-[10px] font-semibold text-amber-700">cancel requested</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#1A1A1A]/60">{day(row.current_period_end)}</td>
                      <td className="px-4 py-2.5 text-[#1A1A1A]/60">
                        {row.sales_rep_name || "—"}
                        {row.sales_rep_phone ? <span className="block text-[10px] text-[#1A1A1A]/40">{row.sales_rep_phone}</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {["active", "trialing", "past_due", "paused", "incomplete"].includes(row.status) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReason("");
                              setTarget(row);
                            }}
                            disabled={!!busy}
                            className="text-red-700 hover:bg-red-50"
                          >
                            <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                          </Button>
                        ) : (
                          <span className="text-[11px] text-[#1A1A1A]/35">{row.cancelled_at ? `cancelled ${day(row.cancelled_at)}` : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-[#1A1A1A]">Cancel this membership?</DialogTitle>
            <DialogDescription className="text-sm text-[#1A1A1A]/55">
              {target?.client_name || target?.client_email} loses Preferred access immediately. The Stripe subscription is cancelled at the same time, so no further payment is taken.
            </DialogDescription>
          </DialogHeader>
          <input
            placeholder="Reason (recorded on the request)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-lg border border-[#B8956A]/30 bg-white px-3 py-2 text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setTarget(null)} className="border-[#1A1A1A]/20">Keep it</Button>
            <Button size="sm" onClick={confirmCancel} disabled={!!busy} className="bg-red-700 text-white hover:bg-red-800">
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}
              Cancel membership
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}