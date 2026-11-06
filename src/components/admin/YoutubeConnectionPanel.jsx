import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Youtube, Loader2, CheckCircle2, AlertCircle, ExternalLink, Link2Off } from "lucide-react";

/**
 * Administrator control for Arriv's YouTube channel.
 *
 * Delivering an approved unbranded tour video to YouTube needs one thing from a person: consenting
 * to Arriv's channel once, here. After that the upload worker runs on its own. Until it is
 * connected, videos stay safely on Google Drive and the customer gallery simply reports that the
 * unbranded link is still being prepared.
 */
export default function YoutubeConnectionPanel() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [returnNotice, setReturnNotice] = useState(null);

  const authParams = () => ({
    email: localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email") || undefined,
    sales_member_id: localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id") || undefined,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("manageYoutubeConnection", { action: "status", ...authParams() });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setState(data);
    } catch (err) {
      setError(err.message || "Could not read the YouTube connection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("youtube");
    if (result) {
      const messages = {
        connected: { ok: true, text: "YouTube channel connected." },
        denied: { ok: false, text: "Authorization was declined at Google." },
        missing_code: { ok: false, text: "Google did not return an authorization code." },
        not_configured: { ok: false, text: "YouTube credentials are not set yet." },
        bad_state: { ok: false, text: "That authorization link expired or was not started here. Try again." },
        no_refresh_token: { ok: false, text: "Google did not grant offline access. Remove the app's access in your Google account and reconnect." },
        error: { ok: false, text: "The connection could not be completed." },
      };
      setReturnNotice(messages[result] || null);
      window.history.replaceState({}, "", window.location.pathname);
    }
    load();
  }, [load]);

  const connect = async () => {
    setBusy("connect");
    setError(null);
    try {
      const res = await base44.functions.invoke("manageYoutubeConnection", { action: "connect_url", ...authParams() });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        // Google refuses to render its consent screen inside an iframe (the builder preview),
        // so the flow always opens as its own top-level browser tab.
        const opened = window.open(data.url, "_blank", "noopener,noreferrer");
        if (!opened) window.top.location.href = data.url;
      }
      setBusy(null);
    } catch (err) {
      setError(err.message || "Could not start the YouTube connection");
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError(null);
    try {
      await base44.functions.invoke("manageYoutubeConnection", { action: "disconnect", ...authParams() });
      await load();
    } catch (err) {
      setError(err.message || "Could not disconnect the channel");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.25)" }}>
      <div className="flex items-start gap-3">
        <Youtube className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#B8956A" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>YouTube channel</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(26,26,26,0.6)" }}>
            Approved, unbranded property tours are uploaded here automatically as unlisted videos.
          </p>

          {loading ? (
            <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "rgba(26,26,26,0.5)" }}>
              <Loader2 className="w-3 h-3 animate-spin" /> Checking connection...
            </p>
          ) : !state?.configured ? (
            <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: "#92400e" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Not configured. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in Secrets, then reconnect here.
            </p>
          ) : state?.connected ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs flex items-center gap-1.5 font-medium" style={{ color: "#166534" }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected to {state.channel_title || "Arriv channel"}
              </p>
              <p className="text-[11px]" style={{ color: "rgba(26,26,26,0.5)" }}>
                {state.counts?.ready || 0} ready · {state.counts?.queued || 0} queued · {state.counts?.failed || 0} failed
              </p>
            </div>
          ) : (
            <p className="text-xs mt-2" style={{ color: "rgba(26,26,26,0.6)" }}>
              Not connected. Delivery to Google Drive is unaffected.
            </p>
          )}

          {returnNotice && (
            <p className="text-xs mt-2" style={{ color: returnNotice.ok ? "#166534" : "#b91c1c" }}>
              {returnNotice.text}
            </p>
          )}
          {error && (
            <p className="text-xs mt-2" style={{ color: "#b91c1c" }}>{error}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            {state?.configured && (
              <Button size="sm" onClick={connect} disabled={!!busy} className="bg-[#B8956A] hover:bg-[#a68559] text-[#1A1A1A]">
                {busy === "connect" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-1" />}
                {state?.connected ? "Reconnect channel" : "Connect YouTube channel"}
              </Button>
            )}
            {state?.connected && (
              <Button size="sm" variant="outline" onClick={disconnect} disabled={!!busy} className="border-[#B8956A]/40 text-[#8a6d4a]">
                {busy === "disconnect" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2Off className="w-4 h-4 mr-1" />}
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}