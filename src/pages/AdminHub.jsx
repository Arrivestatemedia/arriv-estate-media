import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FloatingChatBubble from "@/components/sales/FloatingChatBubble";
import PoweredByFooter from "@/components/PoweredByFooter";

export default function AdminHub() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    const role = localStorage.getItem('sales_member_role');
    
    if (salesMemberId && role === 'admin') {
      setUser({
        id: salesMemberId,
        full_name: localStorage.getItem('sales_member_name'),
        email: localStorage.getItem('sales_member_email'),
        type: 'admin'
      });
    } else {
      window.location.href = createPageUrl('SalesLogin');
    }
  }, []);

  const { data: salesMembers = [] } = useQuery({
    queryKey: ['salesTeam'],
    queryFn: () => base44.entities.SalesTeamMember.list(),
    enabled: !!user
  });

  const activeRepsCount = salesMembers.filter(m => m.is_active && m.role !== 'admin').length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">Loading...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>
            Admin Hub
          </h1>
          <p className="mt-2" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
            Welcome, {user.full_name}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Active Sales Reps</p>
                  <p className="text-3xl font-bold mt-2" style={{ color: '#B8956A' }}>
                    {activeRepsCount}
                  </p>
                </div>
                <Users className="w-10 h-10" style={{ color: 'rgba(184, 149, 106, 0.3)' }} />
              </div>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Total Members</p>
                  <p className="text-3xl font-bold mt-2" style={{ color: '#B8956A' }}>
                    {salesMembers.length}
                  </p>
                </div>
                <Activity className="w-10 h-10" style={{ color: 'rgba(184, 149, 106, 0.3)' }} />
              </div>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Messages</p>
                  <p className="text-3xl font-bold mt-2" style={{ color: '#B8956A' }}>
                    0
                  </p>
                </div>
                <MessageSquare className="w-10 h-10" style={{ color: 'rgba(184, 149, 106, 0.3)' }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sales Team Management */}
          <Link to={createPageUrl('AdminSalesSignup')} className="block">
            <Card className="cursor-pointer hover:shadow-lg transition" style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                  <Users className="w-5 h-5" />
                  Sales Team Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                  Add, edit, and manage sales team members. Assign and remove phone numbers.
                </p>
                <Button variant="outline" className="mt-4" style={{ color: '#B8956A', borderColor: '#B8956A' }}>
                  Manage Team
                </Button>
              </CardContent>
            </Card>
          </Link>

          {/* Sales Rep Activity */}
          <Link to={createPageUrl('AdminSalesRepActivity')} className="block">
            <Card className="cursor-pointer hover:shadow-lg transition" style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                  <Activity className="w-5 h-5" />
                  Sales Rep Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                  Monitor sales activities, calls, emails, and meetings across your team.
                </p>
                <Button variant="outline" className="mt-4" style={{ color: '#B8956A', borderColor: '#B8956A' }}>
                  View Activity
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Phone Assignment Note */}
        <Card className="mt-8" style={{ backgroundColor: 'rgba(184, 149, 106, 0.1)', borderColor: 'rgba(184, 149, 106, 0.3)' }}>
          <CardContent className="pt-6">
            <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
              Phone Management
            </p>
            <p className="text-sm mt-2" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
              Manage Twilio phone numbers for your sales team in the Sales Team Management section. Only assigned phone numbers can be used for dialing.
            </p>
          </CardContent>
        </Card>

        <PoweredByFooter />
      </div>

      {/* Floating Chat Bubble */}
      {user && <FloatingChatBubble currentUserId={user.id} currentUserName={user.full_name} />}
    </div>
  );
}