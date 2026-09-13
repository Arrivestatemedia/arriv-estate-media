import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, Mail, Unlink, Building2 } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";

export default function RepEmailConnectionControl({ member, onUpdated }) {
  const [connectionType, setConnectionType] = useState("none");
  const [emailAddress, setEmailAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState(null);
  const [smtpForm, setSmtpForm] = useState({ host: "", port: "", username: "", password: "" });

  useEffect(() => {
    const type = member.email_connection_type || (member.gmail_access_token ? "gmail_oauth" : "none");
    setConnectionType(type);
    setEmailAddress(
      member.microsoft_email || member.company_email || member.smtp_username || ""
    );
    if (type === "smtp") {
      setSmtpForm({
        host: member.smtp_host || "",
        port: member.smtp_port || "",
        username: member.smtp_username || "",
        password: "",
      });
    }
    setLoading(false);
  }, [member]);

  const adminId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("generateSalesRepGmailAuthUrl", {
        memberId: member.id,
        adminId,
      });
      const url = res?.data?.authUrl || res?.authUrl;
      if (url) window.location.href = url;
    } catch (err) {
      setError(err.message);
    } finally {
      setConnectingGmail(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setConnectingMicrosoft(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("generateSalesRepMicrosoftAuthUrl", {
        memberId: member.id,
        adminId,
      });
      const url = res?.data?.authUrl || res?.authUrl;
      if (url) window.location.href = url;
    } catch (err) {
      setError(err.message);
    } finally {
      setConnectingMicrosoft(false);
    }
  };

  const handleSaveSmtp = async () => {
    if (!smtpForm.username) {
      setError("Email address is required");
      return;
    }
    setSavingSmtp(true);
    setError(null);
    try {
      await base44.functions.invoke("manageRepEmailConnection", {
        action: "save_smtp",
        memberId: member.id,
        adminId,
        smtpHost: smtpForm.host,
        smtpPort: smtpForm.port ? parseInt(smtpForm.port) : null,
        smtpUsername: smtpForm.username,
        smtpPassword: smtpForm.password || undefined,
      });
      setConnectionType("smtp");
      setEmailAddress(smtpForm.username);
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect this email account? The rep will not be able to send or receive email until a new connection is set up.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      await base44.functions.invoke("manageRepEmailConnection", {
        action: "disconnect",
        memberId: member.id,
        adminId,
      });
      setConnectionType("none");
      setEmailAddress("");
      setSmtpForm({ host: "", port: "", username: "", password: "" });
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: GOLD }} />
        <span className="text-sm" style={{ color: MUTED }}>Loading email connection...</span>
      </div>
    );
  }

  const providerLabel = {
    gmail_oauth: "Gmail",
    microsoft_oauth: "Microsoft 365",
    smtp: "SMTP Relay",
  }[connectionType];

  // Connected state
  if (connectionType !== "none") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
          <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#22c55e" }} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" style={{ color: TEXT_DARK }}>{emailAddress}</p>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full inline-block mt-1" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
              {providerLabel}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting} className="shrink-0 gap-1.5" style={{ borderColor: "rgba(220,38,38,0.3)", color: "#dc2626" }}>
            {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
            Disconnect
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  // Not connected state
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleConnectGmail} disabled={connectingGmail} className="flex-1 gap-1.5" style={{ borderColor: "rgba(184,149,106,0.3)", color: TEXT_DARK }}>
          {connectingGmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          Connect Gmail
        </Button>
        <Button variant="outline" size="sm" onClick={handleConnectMicrosoft} disabled={connectingMicrosoft} className="flex-1 gap-1.5" style={{ borderColor: "rgba(184,149,106,0.3)", color: TEXT_DARK }}>
          {connectingMicrosoft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
          Connect Microsoft 365
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(184,149,106,0.2)" }} />
        <span className="text-xs" style={{ color: MUTED }}>Or connect via SMTP</span>
        <div className="flex-1 h-px" style={{ backgroundColor: "rgba(184,149,106,0.2)" }} />
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>SMTP Host</label>
            <Input placeholder="smtp.gmail.com" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} className="text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Port</label>
            <Input type="number" placeholder="587" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })} className="text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Email Address (From)</label>
          <Input type="email" placeholder="rep@company.com" value={smtpForm.username} onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })} className="text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Password</label>
          <Input type="password" placeholder="••••••••" value={smtpForm.password} onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })} className="text-sm" />
        </div>
        <Button onClick={handleSaveSmtp} disabled={savingSmtp} className="w-full gap-1.5" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
          {savingSmtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          Save SMTP Connection
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}