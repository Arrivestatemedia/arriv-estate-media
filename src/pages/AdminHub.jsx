import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users, BarChart3 } from "lucide-react";
import AdminSalesSignup from "./AdminSalesSignup";
import AdminSalesRepActivity from "./AdminSalesRepActivity";
import AdminChatBubble from "@/components/admin/AdminChatBubble";
import PoweredByFooter from "@/components/PoweredByFooter";

export default function AdminHub() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("team");

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email');
    
    if (salesMemberId && salesMemberEmail) {
      // Verify this user is an admin
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        if (members?.[0]?.role === 'admin') {
          setUser({
            id: salesMemberId,
            email: salesMemberEmail,
            full_name: localStorage.getItem('sales_member_name'),
            role: 'admin'
          });
        } else {
          // Not an admin, redirect to activity log
          window.location.href = '/HubSpotActivityLog';
        }
      }).catch(() => {
        window.location.href = '/SalesLogin';
      });
    } else {
      window.location.href = '/SalesLogin';
    }
  }, []);

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold" style={{ color: '#1A1A1A' }}>Admin Hub</h1>
          <p className="mt-2" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Manage sales team and monitor activity</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Sales Team
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-6">
            <AdminSalesSignup isAdmin={true} />
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <AdminSalesRepActivity />
          </TabsContent>
        </Tabs>

        <PoweredByFooter />
      </div>

      {/* Admin floating chat bubble */}
      <AdminChatBubble currentUserId={user.id} currentUserName={user.full_name} />
    </div>
  );
}