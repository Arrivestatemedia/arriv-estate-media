import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Plus, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

export default function EmailProviderSettings() {
  const [config, setConfig] = useState(null);
  const [inboundUrl, setInboundUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageEmailProvider", { action: "get" });
      const d = res?.data || res;
      setConfig(d);
      if (d?.inbound_enabled && d?.inbound_webhook_token) {
        setInboundUrl(`${window.location.origin}/functions/smtpInboundWebhook?token=${d.inbound_webhook_token}`);
      } else {
        setInboundUrl("");
      }
    } catch (e) {
      // Config might not exist yet — that's fine
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const enableInbound = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageEmailProvider", { action: "enable_inbound" });
      const d = res?.data || res;
      setConfig(d);
      if (d?.inbound_webhook_token) {
        setInboundUrl(`${window.location.origin}/functions/smtpInboundWebhook?token=${d.inbound_webhook_token}`);
      }
      toast.success("Inbound email forwarding enabled");
    } catch (e) {
      toast.error("Failed to enable inbound: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const disableInbound = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageEmailProvider", { action: "disable_inbound" });
      const d = res?.data || res;
      setConfig(d);
      setInboundUrl("");
      toast.success("Inbound email forwarding disabled");
    } catch (e) {
      toast.error("Failed to disable inbound: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const copyInboundUrl = () => {
    navigator.clipboard.writeText(inboundUrl);
    toast.success("Webhook URL copied to clipboard");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading email settings...
      </div>
    );
  }

  return (
    <div className="pt-3" style={{ borderTop: '1px solid rgba(184,149,106,0.2)' }}>
      <label className="text-sm font-medium flex items-center gap-2" style={{ color: '#1A1A1A' }}>
        <Mail className="w-4 h-4" style={{ color: '#B8956A' }} />
        Inbound Email Forwarding
      </label>
      <p className="text-xs mb-2 mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
        Enable this so SMTP-connected users can see their inbox in the Email Hub. Forward incoming emails to the webhook URL below — we'll parse and store them so users can read replies.
      </p>
      {config?.inbound_enabled ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#B8956A' }}>
            <CheckCircle2 className="w-4 h-4" />
            Inbound forwarding active
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={inboundUrl} className="flex-1 font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={copyInboundUrl} className="shrink-0">
              <Copy className="w-3.5 h-3.5" />
              Copy URL
            </Button>
          </div>
          <div className="text-xs space-y-1 mt-2" style={{ color: 'rgba(26,26,26,0.6)' }}>
            <p className="font-medium" style={{ color: '#1A1A1A' }}>Setup in your email provider:</p>
            <p>• <strong>Mailgun:</strong> Routes → Create Route → Forward to URL → paste the URL above</p>
            <p>• <strong>SendGrid:</strong> Settings → Inbound Parse → add hostname → point to the URL above</p>
            <p>• <strong>Postmark:</strong> Servers → Inbound → set inbound hook URL to the URL above</p>
            <p>• <strong>Any email server:</strong> Set up a forward/alias to POST the raw email to the URL above</p>
            <p>• <strong>Cloudflare Email Routing:</strong> Create a Worker that forwards to the URL above</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={disableInbound}
            disabled={saving}
            className="mt-2"
            style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Disable inbound forwarding
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={enableInbound}
          disabled={saving}
          className="gap-2 mt-2"
          style={{ borderColor: 'rgba(184,149,106,0.3)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" style={{ color: '#B8956A' }} />}
          Enable inbound email forwarding
        </Button>
      )}
    </div>
  );
}