import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PhoneCall } from "lucide-react";
import OverviewPanel from "@/components/callcenter/OverviewPanel";
import CallHistoryPanel from "@/components/callcenter/CallHistoryPanel";
import VoicemailsPanel from "@/components/callcenter/VoicemailsPanel";
import CallbacksPanel from "@/components/callcenter/CallbacksPanel";
import SupportIssuesPanel from "@/components/callcenter/SupportIssuesPanel";
import IvrSettingsPanel from "@/components/callcenter/IvrSettingsPanel";

export default function CallCenter() {
  const [tab, setTab] = useState("overview");
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl) setTab(fromUrl);

    // Admins reach this app through its own sales login, so a sales-team admin
    // is as valid as a platform admin — the same rule the rest of the admin
    // screens and the navigation use.
    const read = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);
    const salesAdmin = !!read("sales_member_id") && read("sales_member_role") === "admin";
    if (salesAdmin) {
      setAllowed(true);
      return;
    }

    base44.auth
      .me()
      .then((user) => setAllowed(user?.role === "admin"))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return <p className="py-16 text-center text-sm text-[#1A1A1A]/50">Loading call center…</p>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-[#1A1A1A]/60">Administrator access is required to open the Call Center.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-[#1A1A1A]">Call Center</h1>
          <p className="text-sm text-[#1A1A1A]/50">855 and 706 lines · IVR, voicemail, callbacks and Ashley</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/InboundCalls">
            <PhoneCall className="mr-2 h-4 w-4" />
            Inbound calls log
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex w-full flex-wrap justify-start gap-1 bg-[#1A1A1A]/5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">Call history</TabsTrigger>
          <TabsTrigger value="voicemails">Voicemails</TabsTrigger>
          <TabsTrigger value="callbacks">Callbacks</TabsTrigger>
          <TabsTrigger value="support">Technical support</TabsTrigger>
          <TabsTrigger value="settings">IVR settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel />
        </TabsContent>
        <TabsContent value="calls">
          <CallHistoryPanel />
        </TabsContent>
        <TabsContent value="voicemails">
          <VoicemailsPanel />
        </TabsContent>
        <TabsContent value="callbacks">
          <CallbacksPanel />
        </TabsContent>
        <TabsContent value="support">
          <SupportIssuesPanel />
        </TabsContent>
        <TabsContent value="settings">
          <IvrSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}