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
  const [activeTab, setActiveTab] = useState("team");

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email');

    if (salesMemberId && salesMemberEmail) {
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        if (members?.[0]?.role === 'admin') {
          setUser({ id: salesMemberId, email: salesMemberEmail, full_name: localStorage.getItem('sales_member_name'), role: 'admin' });
        } else {
          window.location.href = '/HubSpotActivityLog';
        }
      }).catch(() => { window.location.href = '/HubSpotActivityLog'; });
    } else {
      base44.auth.me().then((authUser) => {
        if (authUser?.role === 'admin') {
          setUser(authUser);
        } else {
          window.location.href = '/';
        }
      });
    }
  }, []);

  const { data: salesMembers = [] } = useQuery({
    queryKey: ['salesMembers'],
    queryFn: () => base44.entities.SalesTeamMember.list(),
    enabled: !!user
  });

  const { data: allActivities = [] } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => base44.entities.ActivityLog.list('-activity_date', 500),
    enabled: !!user,
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
    { id: "team", label: "Sales Team" },
    { id: "activity", label: "Sales Activity" },
    { id: "myactivity", label: "My Activity" },
  ];

  if (!user) return <div className="p-4">Loading...</div>;

  // Team view (default)
  if (activeTab === "team") {
    return (
      <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="max-w-2xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
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

          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1A1A1A' }}>Sales Team</h1>
          <p className="mb-8 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Select a rep to view their activity</p>
          <div className="space-y-3">
            {salesMembers.filter(rep => rep.is_active && rep.role !== 'admin').map((rep) => {
              const stats = getRepStats(rep.email);
              return (
                <button
                  key={rep.id}
                  onClick={() => { setSelectedRep(rep); setActiveTab("activity"); }}
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
            {salesMembers.filter(rep => rep.is_active && rep.role !== 'admin').length === 0 && (
              <Card><CardContent className="pt-6 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>No active sales reps found</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Sales Activity or My Activity view
  if (activeTab === "activity" || activeTab === "myactivity") {
    return (
      <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="max-w-4xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "team") {
                    setSelectedRep(null);
                  }
                  setActiveTab(tab.id);
                }}
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

          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1A1A1A' }}>
            {activeTab === "activity" ? "Sales Activity" : "My Activity"}
          </h1>
          
          {activeTab === "activity" && (
            <ActivityLogView
              isAdminView={true}
            />
          )}
          
          {activeTab === "myactivity" && (
            <ActivityLogView
              salesMemberId={user?.id}
              salesMemberEmail={user?.email}
              repName={user?.full_name}
              isAdminView={true}
            />
          )}
        </div>
      </div>
    );
  }
}