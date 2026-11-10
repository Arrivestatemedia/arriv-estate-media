import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { adminAdAction, money } from "@/lib/propertyAds";
import AdCampaignTable from "@/components/property/ads/admin/AdCampaignTable";
import AdCampaignDetail from "@/components/property/ads/admin/AdCampaignDetail";

// Arriv Advertising Management console.
//
// The portfolio, the account readiness and the safety switches in one place. Every number is server
// computed; the switches are the same ones the sweep obeys, so what an administrator sees here is what
// will actually happen to the next launch.
export default function AdminPropertyAdCampaigns() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await base44.auth.me().catch(() => null);
      if (!me) {
        setError("Please sign in as an administrator to open this console.");
        return;
      }
      const res = await adminAdAction("list", {});
      if (res?.ok === false) setError(res.message || res.error || "The advertising portfolio could not be loaded.");
      else setData(res);
    } catch (err) {
      setError(err.message || "The advertising portfolio could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSwitch = async (key, enabled) => {
    setBusy(key);
    try {
      const res = await adminAdAction("switches", { [key]: enabled });
      if (res?.ok === false) setError(res.message || "That switch could not be changed.");
      else setData((current) => ({ ...current, switches: res.switches }));
    } catch (err) {
      setError(err.message || "That switch could not be changed.");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] px-4 py-16 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const readiness = data?.provider?.meta || {};
  const switches = data?.switches || {};

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-16">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#B8956A]">Arriv Advertising</p>
          <h1 className="font-serif text-3xl text-[#1A1A1A]">Advertising management</h1>
          <p className="mt-1 text-sm text-[#1A1A1A]/55">
            Campaigns Arriv runs for customers. Payment never starts a campaign on its own — review, eligibility and these switches
            all have to pass first.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Campaigns", totals.campaigns ?? data?.campaigns?.length ?? 0],
            ["Revenue", money(totals.revenue_cents ?? totals.total_cents ?? 0)],
            ["Ad budget reserved", money(totals.ad_budget_cents ?? 0)],
            ["Spent on platforms", money(totals.spent_cents ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#B8956A]/25 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]/40">{label}</p>
              <p className="mt-1 font-serif text-xl text-[#1A1A1A]">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 rounded-2xl border border-[#B8956A]/25 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
              <ShieldCheck className="h-4 w-4 text-[#B8956A]" /> Safety switches
            </p>
            <p className="text-xs text-[#1A1A1A]/50">
              Meta account: {readiness.connected ? "connected" : readiness.account_status || "not configured"}
              {readiness.configured === false ? " · credentials missing" : ""}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["customer_checkout", "Customer checkout"],
              ["meta_connection", "Advertising platform connection"],
              ["auto_publish", "Automatic launch"],
              ["budget_execution", "Budget execution"],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#B8956A]/20 px-3 py-2">
                <span className="text-xs text-[#1A1A1A]/70">{label}</span>
                <input
                  type="checkbox"
                  checked={switches[key] === true}
                  disabled={busy === key}
                  onChange={(event) => toggleSwitch(key, event.target.checked)}
                  className="h-4 w-4 accent-[#B8956A]"
                />
              </label>
            ))}
          </div>
          {!readiness.connected && (
            <p className="mt-3 text-xs leading-relaxed text-[#1A1A1A]/55">
              While the advertising account is not connected, campaigns can be reviewed and approved but nothing can be sent to a
              platform, and no budget can be spent.
            </p>
          )}
        </div>

        <AdCampaignTable campaigns={data?.campaigns || []} loading={false} onOpen={setOpenId} />
      </div>

      {openId && (
        <AdCampaignDetail
          campaignId={openId}
          onClose={() => setOpenId("")}
          onChanged={() => {
            load();
          }}
        />
      )}
    </div>
  );
}