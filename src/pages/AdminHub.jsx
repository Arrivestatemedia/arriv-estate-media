import React, { useState, useEffect, Suspense, lazy } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminChatBubble from "@/components/admin/AdminChatBubble";
import ProfilePictureUpload from "@/components/sales/ProfilePictureUpload";
import PoweredByFooter from "@/components/PoweredByFooter";
import EditMyProfileModal from "@/components/sales/EditMyProfileModal";

const AdminSalesSignup = lazy(() => import("./AdminSalesSignup"));
const AdminSalesRepActivity = lazy(() => import("./AdminSalesRepActivity"));
const AdminActivityPage = lazy(() => import("./AdminActivityPage"));

export default function AdminHub() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("team");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

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
        setTimeout(() => setShowPermissionBanner(true), 500);
      } else {
        // Not an admin, redirect to activity log
        window.location.href = '/HubSpotActivityLog';
      }
    }).catch(() => {
      window.location.href = '/SalesLogin';
    });
  }, []);



  // Handle contact card interactions
  useEffect(() => {
    const handleOpenContact = (e) => {
      const contact = e.detail;
      // Split name into firstName and lastName
      const nameParts = (contact.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const enrichedContact = { ...contact, firstName, lastName };
      
      localStorage.setItem('newContactData', JSON.stringify(enrichedContact));
      setActiveTab('activity');
      // Wait for tab switch, then fire event
      setTimeout(() => {
        window.dispatchEvent(new Event('contactCardReady'));
      }, 100);
    };

    const handleOpenDialer = (e) => {
      setActiveTab('activity');
      const { phone } = e.detail;
      setTimeout(() => {
        localStorage.setItem('dialerPhone', phone);
        window.dispatchEvent(new Event('dialerCardReady'));
      }, 0);
    };

    const handleOpenEmailComposer = (e) => {
      setActiveTab('activity');
      const { email } = e.detail;
      setTimeout(() => {
        localStorage.setItem('emailTo', email);
        window.dispatchEvent(new Event('emailCardReady'));
      }, 0);
    };

    window.addEventListener('openContact', handleOpenContact);
    window.addEventListener('openDialer', handleOpenDialer);
    window.addEventListener('openEmailComposer', handleOpenEmailComposer);

    return () => {
      window.removeEventListener('openContact', handleOpenContact);
      window.removeEventListener('openDialer', handleOpenDialer);
      window.removeEventListener('openEmailComposer', handleOpenEmailComposer);
    };
  }, []);

  // Sync chat status with calendar every 3 minutes
  useEffect(() => {
    const syncStatus = async () => {
      try {
        await base44.functions.invoke('syncAdminChatStatusWithCalendar', {});
      } catch (error) {
        console.error('Chat status sync error:', error);
      }
    };

    syncStatus();
    const interval = setInterval(syncStatus, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEnablePermissions = async () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      window._unlockedAudioCtx = ctx;
    } catch (e) {
      console.error("Audio unlock failed:", e);
    }
    if ("Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
    setShowPermissionBanner(false);
  };

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-7xl mx-auto">

        {showPermissionBanner && (
          <div className="mb-4 p-4 rounded-xl border flex items-center justify-between gap-4" style={{ backgroundColor: 'rgba(184,149,106,0.1)', borderColor: 'rgba(184,149,106,0.4)' }}>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>Enable Sounds & Notifications</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(26,26,26,0.6)' }}>Get notified with sounds when you receive new chats or texts.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowPermissionBanner(false)}>Skip</Button>
              <Button size="sm" onClick={handleEnablePermissions} style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>Enable</Button>
            </div>
          </div>
        )}

        <div className="flex items-start gap-6 mb-8">
          <ProfilePictureUpload
            salesMemberId={user.id}
            currentUrl={profilePicUrl}
            onUploaded={(url) => setProfilePicUrl(url)}
          />
          <div className="flex-1">
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
            <button
              className="text-xs mt-1 underline"
              style={{ color: 'rgba(26,26,26,0.5)' }}
              onClick={() => setShowEditProfile(true)}
            >
              Edit Profile
            </button>
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
              <AdminActivityPage user={user} onVideoCallStateChange={setIsVideoCallActive} />
            </Suspense>
          </TabsContent>
        </Tabs>

        <PoweredByFooter />
      </div>

      <EditMyProfileModal
        salesMemberId={user.id}
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
      />

      {/* Admin floating chat bubble */}
      <AdminChatBubble
        currentUserId={user.id}
        currentUserName={user.full_name}
        isVideoActive={activeTab === "activity"} // Chat bubble positioning depends on if admin has video active
        onInitiateTransfer={(memberId, memberName) => {
          base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
            const ext = members?.[0]?.extension;
            if (ext) {
              // Switch to My Activity tab, then signal AdminActivityPage to open dialer
              setActiveTab("activity");
              localStorage.setItem('dialerPhone', String(ext));
              setTimeout(() => {
                window.dispatchEvent(new Event('dialerCardReady'));
              }, 300);
            }
          }).catch(() => {});
        }}
      />
    </div>
  );
}