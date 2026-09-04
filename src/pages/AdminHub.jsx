import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Activity, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminChatBubble from "@/components/admin/AdminChatBubble";
import AdminDashboardGrid from "@/components/admin/AdminDashboardGrid";
import ContactReassignmentSettingToggle from "@/components/sales/ContactReassignmentSettingToggle";
import ProfilePictureUpload from "@/components/sales/ProfilePictureUpload";
import PoweredByFooter from "@/components/PoweredByFooter";
import EditMyProfileModal from "@/components/sales/EditMyProfileModal";
import IncomingVideoCallModal from "@/components/sales/IncomingVideoCallModal";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";
import CallStateBadge from "@/components/sales/CallStateBadge";
import { useCallStatus } from "@/components/CallStatusContext";

const HubSpotActivityLog = lazy(() => import("./HubSpotActivityLog"));

export default function AdminHub() {
  const { setCallStatus: setContextCallStatus } = useCallStatus();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "dashboard";
  });
  const [initialSubTab, setInitialSubTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("subtab") || null;
  });
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [isVideoCallActive, setIsVideoCallActive] = useState(false);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [incomingVideoCall, setIncomingVideoCall] = useState(null);
  const [activeVideoCall, setActiveVideoCall] = useState(null);
  const [isVideoWindowOpen, setIsVideoWindowOpen] = useState(false);
  const [videoCallProcessing, setVideoCallProcessing] = useState(false);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [lastCallEvent, setLastCallEvent] = useState("");
  const [repReassignmentEnabled, setRepReassignmentEnabled] = useState(true);

  // Derive isInLiveCall from callStatus (single source of truth)
  const isInLiveCall = callStatus !== 'idle';
  
  // Sync local callStatus to context
  useEffect(() => {
    setContextCallStatus(callStatus);
  }, [callStatus, setContextCallStatus]);

  // Centralized idempotent call teardown
  const endVideoCall = (reason) => {
    setLastCallEvent(reason || 'LOCAL_END');
    setCallStatus("idle");
    setIsVideoWindowOpen(false);
    setActiveVideoCall(null);
    setIncomingVideoCall(null);
    setHasUnreadNotification(false);
    setIsVideoCallActive(false);
  };

  useEffect(() => {
    // Explicit initialization on mount
    setIsVideoWindowOpen(false);
    setActiveVideoCall(null);
    setIncomingVideoCall(null);
    setCallStatus("idle");
    setLastCallEvent("");

    const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');

    // Check Base44 platform admin role (takes precedence over SalesTeamMember role)
    const checkPlatformAdmin = base44.auth.isAuthenticated()
      .then((isAuth) => isAuth ? base44.auth.me() : null)
      .then((me) => me?.role === 'admin')
      .catch(() => false);

    checkPlatformAdmin.then((platformIsAdmin) => {
      if (!salesMemberId || !salesMemberEmail) {
        if (platformIsAdmin) {
          // Platform admin without a sales session — allow access
          setUser({ id: null, email: null, full_name: null, role: 'admin' });
          setTimeout(() => setShowPermissionBanner(true), 500);
        } else {
          window.location.href = '/SalesLogin';
        }
        return;
      }

      // Verify this user is an admin (SalesTeamMember role OR platform admin role)
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        const member = members?.[0];
        if (member?.role === 'admin' || platformIsAdmin) {
          setUser({
            id: salesMemberId,
            email: salesMemberEmail,
            full_name: salesMemberName,
            role: 'admin',
            profile_picture_url: member?.profile_picture_url
          });
          setProfilePicUrl(member?.profile_picture_url || "");
          setTimeout(() => setShowPermissionBanner(true), 500);
        } else {
          // Not an admin, redirect to activity log
          window.location.href = '/HubSpotActivityLog';
        }
      }).catch(() => {
        if (platformIsAdmin) {
          setUser({ id: salesMemberId, email: salesMemberEmail, full_name: salesMemberName, role: 'admin' });
          setTimeout(() => setShowPermissionBanner(true), 500);
        } else {
          window.location.href = '/SalesLogin';
        }
      });
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
      setActiveTab('my_dashboard');
      // Wait for tab switch, then fire event
      setTimeout(() => {
        window.dispatchEvent(new Event('contactCardReady'));
      }, 100);
    };

    const handleOpenDialer = (e) => {
      setActiveTab('my_dashboard');
      const { phone } = e.detail;
      setTimeout(() => {
        localStorage.setItem('dialerPhone', phone);
        window.dispatchEvent(new Event('dialerCardReady'));
      }, 0);
    };

    const handleOpenEmailComposer = (e) => {
      setActiveTab('my_dashboard');
      const { email } = e.detail;
      setTimeout(() => {
        localStorage.setItem('emailTo', email);
        window.dispatchEvent(new Event('emailCardReady'));
      }, 0);
    };

    const handleOpenCallQueue = () => {
      setActiveTab('my_dashboard');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switchToQueueTab'));
      }, 100);
    };

    window.addEventListener('openContact', handleOpenContact);
    window.addEventListener('openDialer', handleOpenDialer);
    window.addEventListener('openEmailComposer', handleOpenEmailComposer);
    window.addEventListener('adminOpenCallQueue', handleOpenCallQueue);

    return () => {
      window.removeEventListener('openContact', handleOpenContact);
      window.removeEventListener('openDialer', handleOpenDialer);
      window.removeEventListener('openEmailComposer', handleOpenEmailComposer);
      window.removeEventListener('adminOpenCallQueue', handleOpenCallQueue);
    };
  }, []);

  // Listen for incoming video calls at the top-level (works regardless of active tab)
  useEffect(() => {
    if (!user?.id) return;

    // Mark any stale unread notifications as read
    base44.entities.PendingNotification.filter({
      recipient_id: user.id,
      event_type: 'incoming_video_call',
      is_read: false
    }).then(existing => {
      if (existing?.[0]) {
        base44.entities.PendingNotification.update(existing[0].id, { is_read: true }).catch(() => {});
      }
    });

    const unsub = base44.entities.PendingNotification.subscribe((event) => {
       // When we initiated an outgoing call, hide the chat bubble immediately
       if (event.type === 'create' && event.data?.event_type === 'outgoing_video_call' && event.data?.recipient_id === user.id) {
         setCallStatus("calling");
         setLastCallEvent('OUTBOUND_INITIATED');
         return;
       }

       if (
         event.type === 'create' &&
         event.data?.event_type === 'incoming_video_call' &&
         event.data?.recipient_id === user.id
       ) {
         const d = event.data.event_data;
         setLastCallEvent('INBOUND_RECEIVED');
         setCallStatus("ringing");
         setHasUnreadNotification(true);
         setIncomingVideoCall({
           notificationId: event.id,
           roomName: d.roomName,
           callerName: d.callerName,
           callerExtension: d.callerExtension,
           recipientToken: d.recipientToken
         });
         }
         });

        return () => unsub();
        }, [user?.id]);

  const handleAcceptVideoCall = async () => {
    if (!incomingVideoCall) return;
    setVideoCallProcessing(true);
    setCallStatus("connecting");
    setHasUnreadNotification(false);
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setActiveVideoCall(incomingVideoCall);
    setLastCallEvent('ACCEPT_INBOUND');
    setCallStatus("connected");
    setIsVideoWindowOpen(true);
    setIsVideoCallActive(true);
    setIncomingVideoCall(null);
    setVideoCallProcessing(false);
  };

  const handleDeclineVideoCall = async () => {
    if (!incomingVideoCall) return;
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setIncomingVideoCall(null);
  };

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

  // Fetch org-wide non-admin contact reassignment setting
  useEffect(() => {
    base44.entities.AppSetting.filter({ key: "non_admin_contact_reassignment" })
      .then(rows => {
        if (rows && rows.length > 0) setRepReassignmentEnabled(rows[0].value !== "false");
      })
      .catch(() => {});
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Admin Dashboard
            </TabsTrigger>
            <TabsTrigger value="my_dashboard" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              My Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="mb-6 flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
              <Settings className="w-5 h-5 shrink-0" style={{ color: '#B8956A' }} />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Organization Settings</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(26,26,26,0.6)' }}>Control what your sales reps can do.</p>
              </div>
              <ContactReassignmentSettingToggle
                enabled={repReassignmentEnabled}
                onToggle={setRepReassignmentEnabled}
              />
            </div>
            <AdminDashboardGrid />
          </TabsContent>

          <TabsContent value="my_dashboard" className="mt-6">
            <Suspense fallback={<div className="p-4">Loading...</div>}>
              <HubSpotActivityLog embedded={true} />
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

      {/* Incoming video call modal */}
      {incomingVideoCall && (
        <IncomingVideoCallModal
          callerName={incomingVideoCall.callerName}
          callerExtension={incomingVideoCall.callerExtension}
          onAccept={handleAcceptVideoCall}
          onDecline={handleDeclineVideoCall}
          isProcessing={videoCallProcessing}
        />
      )}

      {/* Active video call panel */}
      {activeVideoCall && (
        <VideoCallPanelV2
          recipientName={activeVideoCall.callerName}
          callerToken={activeVideoCall.recipientToken}
          roomName={activeVideoCall.roomName}
          currentUserName={user?.full_name}
          isIncoming={true}
          autoStart={true}
          onClose={() => endVideoCall("user_ended")}
          onMinimize={() => setIsVideoWindowOpen(false)}
          isVideoWindowOpen={isVideoWindowOpen}
          onChatOpenRequest={() => {}}
        />
      )}

      {/* Minimized call restore button - always visible when call is minimized */}
      {activeVideoCall && !isVideoWindowOpen && (
        <div className="fixed bottom-4 left-4 z-[99999] flex flex-col gap-2">
          <button
            onClick={() => setIsVideoWindowOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg"
          >
            📞 Return to Call
          </button>
          <button
            onClick={() => endVideoCall("user_ended")}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg"
          >
            ✕ End Call
          </button>
        </div>
      )}

      {/* Admin floating chat bubble - hidden during live call, disabled when video call active */}
       {((callStatus === 'idle') || hasUnreadNotification) && (
         <AdminChatBubble
         currentUserId={user.id}
         currentUserName={user.full_name}
         isVideoActive={false}
         disabled={isInLiveCall}
         isInLiveCall={isInLiveCall}
         activeVideoCall={activeVideoCall}
         isVideoWindowOpen={isVideoWindowOpen}
         onVideoCallStarted={(data) => {
           if (data && typeof data === 'object' && data.roomName) {
             setLastCallEvent('OUTBOUND_START');
             setCallStatus("calling");
             setActiveVideoCall({ callerName: data.recipientName || "Video Call", roomName: data.roomName, recipientToken: data.token });
             setIsVideoWindowOpen(true);
           }
         }}
         onInitiateTransfer={(memberId, memberName) => {
            base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
              const ext = members?.[0]?.extension;
              if (ext) {
                setActiveTab("my_dashboard");
                localStorage.setItem('dialerPhone', String(ext));
                setTimeout(() => {
                  window.dispatchEvent(new Event('dialerCardReady'));
                }, 300);
              }
            }).catch(() => {});
          }}
          />
           )}
    </div>
  );
}