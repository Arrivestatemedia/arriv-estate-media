import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Users, Activity, MessageCircle, LogOut } from "lucide-react";
import PoweredByFooter from "@/components/PoweredByFooter";
import ChatTab from "@/components/sales/ChatTab";

export default function AdminHub() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    // Check if logged in via sales team
    const salesMemberId = localStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email');
    const salesMemberName = localStorage.getItem('sales_member_name');

    if (salesMemberId && salesMemberEmail && salesMemberName) {
      // Fetch full member data to confirm admin role
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        if (members && members[0]?.role === 'admin') {
          setUser({
            id: salesMemberId,
            email: salesMemberEmail,
            full_name: salesMemberName,
            role: 'admin'
          });
        } else {
          // Not an admin, redirect to login
          window.location.href = createPageUrl('SalesLogin');
        }
      }).catch(() => {
        window.location.href = createPageUrl('SalesLogin');
      });
    } else {
      // Not logged in, redirect to login
      window.location.href = createPageUrl('SalesLogin');
    }
  }, []);

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <div className="bg-[#1A1A1A] text-[#FFFBF5] p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Admin Hub</h1>
              <p className="text-[#B8956A] mt-1">Manage your sales team</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-medium">{user.full_name}</p>
                <Badge className="bg-purple-100 text-purple-800 mt-1">Admin</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#FFFBF5]/70 hover:text-[#FFFBF5]"
                onClick={() => {
                  localStorage.clear();
                  window.location.href = createPageUrl("SalesLogin");
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </Button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 border-b border-[#B8956A]/20">
            {[
              { id: "overview", label: "Overview", icon: Settings },
              { id: "team", label: "Team Management", icon: Users },
              { id: "activity", label: "Activity", icon: Activity },
              { id: "chat", label: "Chat", icon: MessageCircle }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "text-[#B8956A] border-b-2 border-[#B8956A]"
                      : "text-[#FFFBF5]/70 hover:text-[#FFFBF5]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Welcome to Admin Hub</CardTitle>
                <CardDescription>Manage your sales team and monitor activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Quick Actions:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Link to={createPageUrl('AdminSalesSignup')}>
                      <Button className="w-full justify-start gap-2">
                        <Users className="w-4 h-4" />
                        Manage Sales Team
                      </Button>
                    </Link>
                    <Link to={createPageUrl('AdminSalesRepActivity')}>
                      <Button className="w-full justify-start gap-2">
                        <Activity className="w-4 h-4" />
                        View Activity
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "team" && (
          <div>
            <iframe
              src={createPageUrl('AdminSalesSignup')}
              className="w-full h-screen border-0 rounded-lg"
              title="Team Management"
            />
          </div>
        )}

        {activeTab === "activity" && (
          <div>
            <iframe
              src={createPageUrl('AdminSalesRepActivity')}
              className="w-full h-screen border-0 rounded-lg"
              title="Activity Log"
            />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="bg-white rounded-lg shadow-sm p-4" style={{ minHeight: '600px' }}>
            <ChatTab 
              currentUserId={user.id}
              currentUserName={user.full_name}
            />
          </div>
        )}
      </div>

      <PoweredByFooter />
    </div>
  );
}