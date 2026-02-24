import React, { useState, useEffect, Suspense, lazy } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3 } from "lucide-react";
import AdminChatBubble from "@/components/admin/AdminChatBubble";
import ProfilePictureUpload from "@/components/sales/ProfilePictureUpload";
import PoweredByFooter from "@/components/PoweredByFooter";

const AdminSalesSignup = lazy(() => import("./AdminSalesSignup"));
const AdminSalesRepActivity = lazy(() => import("./AdminSalesRepActivity"));
const AdminActivityPage = lazy(() => import("./AdminActivityPage"));

export default function AdminHub() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("team");
  const [profilePicUrl, setProfilePicUrl] = useState("");

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email');
    
    if (!salesMemberId || !salesMemberEmail) {
      window.location.href = '/SalesLogin';
      return;
    }

    // Verify this user is an admin
    base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
      if (members?.[0]?.role === 'admin') {
        setUser({
          id: salesMemberId,
          email: salesMemberEmail,
          full_name: localStorage.getItem('sales_member_name'),
          role: 'admin',
          profile_picture_url: members[0].profile_picture_url
        });
        setProfilePicUrl(members[0].profile_picture_url || "");
      } else {
        // Not an admin, redirect to activity log
        window.location.href = '/HubSpotActivityLog';
      }
    }).catch(() => {
      window.location.href = '/SalesLogin';
    });
  }, []);

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start gap-6 mb-8">
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden border-2 border-gray-300">
              {profilePicUrl ? (
                <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
              )}
            </div>
            <label className="mt-2 block text-xs text-blue-600 cursor-pointer hover:text-blue-700">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      try {
                        const result = await base44.integrations.Core.UploadFile({ file: reader.result });
                        setProfilePicUrl(result.file_url);
                        if (user?.id) {
                          await base44.entities.SalesTeamMember.update(user.id, { profile_picture_url: result.file_url });
                        }
                      } catch (err) {
                        alert('Error uploading photo');
                      }
                    };
                    reader.readAsArrayBuffer(file);
                  }
                }}
              />
              Change Photo
            </label>
          </div>
          <div>
            <h1 className="text-4xl font-bold" style={{ color: '#1A1A1A' }}>
              <span style={{ fontStyle: 'italic' }}>Arriv</span> <span style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#3B82F6' }}>One</span> Admin Hub
            </h1>
            <p className="mt-2 text-sm font-medium" style={{ color: '#B8956A' }}>
              Hi {user.full_name?.split(' ')[0]}, Good {(() => {
                const h = new Date().getHours();
                if (h < 12) return 'Morning';
                if (h < 17) return 'Afternoon';
                return 'Evening';
              })()}!
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Sales Team
            </TabsTrigger>
            <TabsTrigger value="sales_activity" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Sales Activity
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              My Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="mt-6">
            <Suspense fallback={<div className="p-4">Loading...</div>}>
              <AdminSalesSignup isAdmin={true} />
            </Suspense>
          </TabsContent>

          <TabsContent value="sales_activity" className="mt-6">
            <Suspense fallback={<div className="p-4">Loading...</div>}>
              <AdminSalesRepActivity />
            </Suspense>
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <Suspense fallback={<div className="p-4">Loading...</div>}>
              <AdminActivityPage user={user} />
            </Suspense>
          </TabsContent>
        </Tabs>

        <PoweredByFooter />
      </div>

      {/* Admin floating chat bubble */}
      <AdminChatBubble currentUserId={user.id} currentUserName={user.full_name} />
    </div>
  );
}