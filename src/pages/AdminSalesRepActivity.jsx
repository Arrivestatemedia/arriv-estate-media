import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone } from "lucide-react";
import ActivityLogView from "@/components/sales/AdminActivityLogView.jsx";
import EmailComposer from "@/components/sales/EmailComposer";
import ContactSearch from "@/components/sales/ContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import DailyCallQueue from "@/components/sales/DailyCallQueue";
import CalendarTab from "@/components/sales/CalendarTab";
import AiAssistantTab from "@/components/sales/AiAssistantTab";
import ChatTab from "@/components/sales/ChatTab";

export default function AdminSalesRepActivity() {
  const [user, setUser] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "activity";
  });

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
    const salesMemberRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');

    // Check Base44 platform admin role first (takes precedence over SalesTeamMember role)
    const checkPlatformAdmin = base44.auth.isAuthenticated()
      .then((isAuth) => isAuth ? base44.auth.me() : null)
      .then((me) => me?.role === 'admin')
      .catch(() => false);

    checkPlatformAdmin.then((platformIsAdmin) => {
      // Fast path: platform admin or stored sales admin role
      if (platformIsAdmin || salesMemberRole === 'admin') {
        setUser({ id: salesMemberId, email: salesMemberEmail, full_name: salesMemberName, role: 'admin' });
        return;
      }

      if (salesMemberId && salesMemberEmail) {
        base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
          if (members?.[0]?.role === 'admin') {
            setUser({ id: salesMemberId, email: salesMemberEmail, full_name: salesMemberName, role: 'admin' });
          } else {
            window.location.href = '/HubSpotActivityLog';
          }
        }).catch(() => { window.location.href = '/HubSpotActivityLog'; });
      } else {
        // No sales session — already checked platform admin above
        window.location.href = '/';
      }
    });
  }, []);

  const { data: salesMembers = [] } = useQuery({
    queryKey: ['salesMembers'],
    queryFn: async () => {
      const result = await base44.functions.invoke('listAllSalesTeamMembers');
      const data = result?.data || result;
      return data?.members || [];
    },
    enabled: !!user && user.role === 'admin'
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['allActivities'],
    queryFn: async () => {
      try {
        return await base44.entities.ActivityLog.list('-activity_date', 500);
      } catch (e) {
        console.error('ActivityLog list failed:', e);
        return [];
      }
    },
    enabled: !!user && user.role === 'admin',
    refetchInterval: 15000,
  });

  const getRepStats = (repEmail) => {
    const repActivities = allActivities.filter(a => a.sales_member_email === repEmail);
    return {
      total: repActivities.length,
      calls: repActivities.filter(a => a.activity_type === 'call').length,
    };
  };

  const TABS = [
    { id: "activity", label: "Activity Log" },
    { id: "email", label: "Email Hub" },
    { id: "contacts", label: "Contacts" },
    { id: "mycontacts", label: "My Contacts" },
    { id: "queue", label: "Call Queue" },
    { id: "calendar", label: "Calendar" },
    { id: "ai", label: "AI Assistant" },
    { id: "chat", label: "Chat" },
  ];

  if (!user) return <div className="p-4">Loading...</div>;

  // Rep selector screen
  if (!selectedRep) {
    return (
      <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1A1A1A' }}>Sales Rep Activity</h1>
          <p className="mb-8 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Select a rep to view their full dashboard</p>
          <div className="space-y-3">
            {salesMembers.filter(rep => rep.is_active).map((rep) => {
              const stats = getRepStats(rep.email);
              return (
                <button
                  key={rep.id}
                  onClick={() => { setSelectedRep(rep); }}
                  className="w-full text-left p-4 rounded-xl border-2 transition hover:shadow-md"
                  style={{ backgroundColor: '#FFFFFF', borderColor: 'rgba(184,149,106,0.3)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-lg" style={{ color: '#1A1A1A' }}>{rep.full_name}</p>
                      <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{rep.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{stats.total} activities</Badge>
                      <Badge variant="outline"><Phone className="w-3 h-3 mr-1" />{stats.calls} calls</Badge>
                    </div>
                  </div>
                </button>
              );
            })}
            {salesMembers.filter(rep => rep.is_active).length === 0 && (
              <Card><CardContent className="pt-6 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>No active sales reps found</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full rep dashboard for selected rep (read-only context for admin)
  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRep(null)} className="gap-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
            <ArrowLeft className="w-4 h-4" /> All Reps
          </Button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>{selectedRep.full_name}</h1>
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{selectedRep.email} · Viewing as Admin</p>
          </div>
        </div>

        {/* Tabs — same as rep dashboard */}
        <div className="flex gap-1 mb-6 border-b overflow-x-auto" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap text-sm"
              style={{
                color: activeTab === tab.id ? '#B8956A' : 'rgba(26,26,26,0.6)',
                borderBottomColor: activeTab === tab.id ? '#B8956A' : 'transparent'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content — mirrors HubSpotActivityLog exactly */}
        {activeTab === "activity" && (
          <ActivityLogView
            salesMemberId={selectedRep.id}
            salesMemberEmail={selectedRep.email}
            repName={selectedRep.full_name}
            isAdminView={true}
          />
        )}

        {activeTab === "email" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <EmailComposer salesMemberId={selectedRep.id} isAdmin={true} />
            </CardContent>
          </Card>
        )}

        {activeTab === "contacts" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <ContactSearch salesMemberId={selectedRep.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "mycontacts" && (
          <MyContacts salesMemberId={selectedRep.id} salesMemberEmail={selectedRep.email} />
        )}

        {activeTab === "queue" && (
          <DailyCallQueue
            salesMemberId={selectedRep.id}
            salesMemberEmail={selectedRep.email}
            repName={selectedRep.full_name}
          />
        )}

        {activeTab === "calendar" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <CalendarTab salesMemberId={selectedRep.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "ai" && (
          <AiAssistantTab repName={selectedRep.full_name} />
        )}

        {activeTab === "chat" && (
          <div style={{ height: '600px' }} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <ChatTab
              currentUserId={user?.id}
              currentUserName={user?.full_name}
              salesMemberId={selectedRep.id}
              isAdmin={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}