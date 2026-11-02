import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneIncoming, PhoneMissed, PhoneCall, RefreshCw, Loader2, User } from "lucide-react";
import moment from "moment";

const filters = [
  { key: "all", label: "All calls" },
  { key: "answered", label: "Answered" },
  { key: "missed", label: "Missed" },
];

function CallRow({ call }) {
  const when = call.start_time ? moment.utc(call.start_time).local() : null;
  const label = call.name || (call.from && call.from.replace(/\D/g, "") ? call.from : "Private number");
  const cleanNumber = call.from && /^\+?\d/.test(call.from) ? call.from : "";
  const duration = call.duration > 0 ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : "—";

  return (
    <Card className="border-2 border-[#B8956A]/15">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${call.answered ? "bg-[#B8956A]/15" : "bg-red-50"}`}>
          {call.answered
            ? <PhoneIncoming className="w-5 h-5 text-[#B8956A]" />
            : <PhoneMissed className="w-5 h-5 text-red-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[#1A1A1A] truncate">{label}</p>
            {call.name_source && (
              <span className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/40">{call.name_source}</span>
            )}
            <Badge variant="outline" className={call.answered ? "border-[#B8956A]/40 text-[#8a6f4d]" : "border-red-200 text-red-600"}>
              {call.answered ? "Answered" : call.status === "no-answer" ? "No answer" : call.status || "Missed"}
            </Badge>
          </div>
          <p className="text-sm text-[#1A1A1A]/55 mt-0.5">
            {cleanNumber || "Number withheld"}
            {when ? ` · ${when.format("ddd, MMM D · h:mm A")}` : ""}
            {` · rang ${duration}`}
          </p>
        </div>

        {cleanNumber && (
          <a href={`tel:${cleanNumber}`} className="shrink-0">
            <Button variant="outline" size="sm" className="border-[#B8956A]/40 text-[#8a6f4d]">
              <PhoneCall className="w-4 h-4 mr-2" />
              Call back
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  );
}

export default function InboundCalls() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getInboundCallLog", {
        email: localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email") || undefined,
        sales_member_id: localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id") || undefined,
      });
      const payload = res?.data || res;
      if (payload?.error) throw new Error(payload.error);
      setData(payload);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const calls = data?.calls || [];
  const visible = calls.filter((call) =>
    filter === "all" ? true : filter === "answered" ? call.answered : !call.answered
  );

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <Phone className="w-6 h-6 text-[#B8956A]" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-[#1A1A1A]">Inbound Calls</h1>
              <p className="text-sm text-[#1A1A1A]/60">Everyone who called the business lines, answered or not.</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="text-[#8a6f4d]">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: data?.counts?.total ?? 0 },
            { label: "Answered", value: data?.counts?.answered ?? 0 },
            { label: "Missed", value: data?.counts?.missed ?? 0 },
          ].map((stat) => (
            <Card key={stat.label} className="border-2 border-[#B8956A]/15">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-semibold text-[#1A1A1A]">{stat.value}</p>
                <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/45">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2">
          {filters.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={filter === item.key ? "default" : "outline"}
              onClick={() => setFilter(item.key)}
              className={filter === item.key ? "bg-[#B8956A] hover:bg-[#A68559] text-white" : "border-[#B8956A]/40 text-[#8a6f4d]"}
            >
              {item.label}
            </Button>
          ))}
        </div>

        {loading && !data ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#B8956A]" />
          </div>
        ) : error ? (
          <Card className="border-2 border-red-200">
            <CardContent className="p-6 text-sm text-red-600">{error}</CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card className="border-2 border-[#B8956A]/15">
            <CardContent className="p-10 text-center text-[#1A1A1A]/50">
              <User className="w-8 h-8 mx-auto mb-3 text-[#B8956A]/50" />
              No {filter === "all" ? "" : filter} calls yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visible.map((call) => <CallRow key={call.sid} call={call} />)}
          </div>
        )}
      </div>
    </div>
  );
}