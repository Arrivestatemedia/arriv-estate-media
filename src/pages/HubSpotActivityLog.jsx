import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Clock, Zap, MessageSquare, Eye, EyeOff, Sparkles } from "lucide-react";
import { format } from "date-fns";
import EmailComposer from "@/components/sales/EmailComposer";
import IphoneDialer from "@/components/sales/IphoneDialer";
import ContactSearch from "@/components/sales/ContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import ChatTab from "@/components/sales/ChatTab";
import CalendarTab from "@/components/sales/CalendarTab";
import AiAssistantTab from "@/components/sales/AiAssistantTab";
import PoweredByFooter from "@/components/PoweredByFooter";
import FloatingChatBubble from "@/components/sales/FloatingChatBubble";
import ProfilePictureUpload from "@/components/sales/ProfilePictureUpload";
import EditMyProfileModal from "@/components/sales/EditMyProfileModal";
import IncomingVideoCallModal from "@/components/sales/IncomingVideoCallModal";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";

export default function HubSpotActivityLog() {
  const [user, setUser] = useState(null);
  const [profilePicUrl, setProfilePicUrl] = useState(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [activeTab, setActiveTab] = useState("activity");
  const [showForm, setShowForm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [hubspotContact, setHubspotContact] = useState(null);
  const [contactNotes, setContactNotes] = useState("");
  const [openNewContactForm, setOpenNewContactForm] = useState(false);
  const [prefilledContactData, setPrefilledContactData] = useState(null);
  const [passwordData, setPasswordData] = useState({ current: "", newPw: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [unreadSmsCount, setUnreadSmsCount] = useState(0);
  const [missedCallsCount, setMissedCallsCount] = useState(0);
  const [incomingVideoCall, setIncomingVideoCall] = useState(null); // { notificationId, roomName, callerName, callerExtension, recipientToken }
  const [activeVideoCall, setActiveVideoCall] = useState(null);
  const [minimizedVideoCall, setMinimizedVideoCall] = useState(null);
  const [videoCallProcessing, setVideoCallProcessing] = useState(false);
  const [formData, setFormData] = useState({
    activity_type: "call",
    contact_email: "",
    contact_name: "",
    contact_phone: "",
    company_name: "",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0
  });

  const queryClient = useQueryClient();



  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    if (salesMemberId) {
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        if (members?.[0]?.role === 'admin') {
          window.location.href = '/AdminHub';
          return;
        }
        const u = {
          id: salesMemberId,
          full_name: localStorage.getItem('sales_member_name'),
          email: localStorage.getItem('sales_member_email'),
          type: 'sales'
        };
        setUser(u);
        if (members?.[0]?.profile_picture_url) {
          setProfilePicUrl(members[0].profile_picture_url);
        }
      }).catch(() => {});

      setTimeout(() => setShowPermissionBanner(true), 500);

      // Count unread SMS conversations + unacknowledged missed calls for the dialer badge
      const loadDialerBadge = () => {
        base44.entities.SmsConversation.filter({ sales_member_id: salesMemberId }).then(convos => {
          const total = convos?.reduce((sum, c) => sum + (c.unread_count || 0), 0) || 0;
          setUnreadSmsCount(total);
        }).catch(() => {});
        base44.entities.ActivityLog.filter({ activity_type: 'call', missed: true, missed_acknowledged: false, sales_member_id: salesMemberId }).then(logs => {
          setMissedCallsCount(logs?.length || 0);
        }).catch(() => {});
      };
      loadDialerBadge();

      const smsSub = base44.entities.SmsConversation.subscribe(loadDialerBadge);
      const callSub = base44.entities.ActivityLog.subscribe((event) => {
        if (event.data?.activity_type === 'call') loadDialerBadge();
      });

      // Listen for incoming video call notifications
      const videoCallSub = base44.entities.PendingNotification.subscribe((event) => {
        if (event.type === 'create' && event.data?.event_type === 'incoming_video_call' && event.data?.recipient_id === salesMemberId) {
          const d = event.data.event_data;
          setIncomingVideoCall({
            notificationId: event.id,
            roomName: d.roomName,
            callerName: d.callerName,
            callerExtension: d.callerExtension,
            recipientToken: d.recipientToken
          });
        }
      });

      return () => { smsSub(); callSub(); videoCallSub(); };
    } else {
      base44.auth.me().then((adminUser) => {
        if (adminUser && adminUser.role === 'admin') {
          setUser(adminUser);
        } else {
          window.location.href = '/SalesLogin';
        }
      }).catch(() => {
        window.location.href = '/SalesLogin';
      });
    }
  }, []);

  // ============================================================
  // ⚠️  DO NOT MODIFY THIS useEffect BLOCK ⚠️
  // Listens for contact card click events dispatched by ContactCardDisplay:
  //   - 'openContact'       → switches to Contacts tab, pre-fills new contact form
  //   - 'openDialer'        → sets localStorage '_dialerPhone', switches to Dialer (Keypad tab)
  //   - 'openEmailComposer' → sets localStorage '_emailTo', switches to Send Email tab
  // Removing or changing this will break contact card navigation for sales reps.
  // ============================================================
  useEffect(() => {
    const handleOpenContact = (event) => {
      const contact = event.detail;
      setPrefilledContactData({
        firstName: contact.name?.split(' ')[0] || '',
        lastName: contact.name?.split(' ').slice(1).join(' ') || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || ''
      });
      setOpenNewContactForm(true);
      setActiveTab("contacts");
    };

    const handleOpenDialer = (event) => {
      const { phone } = event.detail;
      if (phone) localStorage.setItem('_dialerPhone', phone);
      setActiveTab("call");
    };

    const handleOpenEmailComposer = (event) => {
      const { email } = event.detail;
      if (email) localStorage.setItem('_emailTo', email);
      setActiveTab("email");
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

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.email],
    queryFn: async () => {
      return await base44.entities.ActivityLog.filter({ sales_member_id: user?.id }, '-activity_date', 200);
    },
    initialData: [],
    enabled: !!user,
  });

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .slice(0, 5);

  const pastActivities = activities
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.ActivityLog.create(data);
      await base44.functions.invoke('syncActivityToHubSpot', { activityId: result.id });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setShowForm(false);
      setFormData({
        activity_type: "call",
        contact_email: "",
        contact_name: "",
        contact_phone: "",
        company_name: "",
        activity_date: new Date().toISOString().slice(0, 16),
        notes: "",
        duration_minutes: 0
      });
    }
  });

  const handleChangePassword = async () => {
    if (!passwordData.newPw || !passwordData.current) {
      setPasswordMsg({ type: "error", text: "Please fill in all fields" });
      return;
    }
    if (passwordData.newPw !== passwordData.confirm) {
      setPasswordMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    try {
      const res = await base44.functions.invoke('changeSalesRepPassword', {
        salesMemberId: user.id,
        currentPassword: passwordData.current,
        newPassword: passwordData.newPw
      });
      if (res.data?.success) {
        setPasswordMsg({ type: "success", text: "Password updated successfully!" });
        setPasswordData({ current: "", newPw: "", confirm: "" });
        setTimeout(() => setShowPasswordModal(false), 1500);
      } else {
        setPasswordMsg({ type: "error", text: res.data?.error || "Failed to update password" });
      }
    } catch (error) {
      setPasswordMsg({ type: "error", text: error.response?.data?.error || "Failed to update password" });
    }
  };

  const handleAcceptVideoCall = async () => {
    if (!incomingVideoCall) return;
    setVideoCallProcessing(true);
    // Mark notification as read
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setActiveVideoCall(incomingVideoCall);
    setIncomingVideoCall(null);
    setVideoCallProcessing(false);
  };

  const handleDeclineVideoCall = async () => {
    if (!incomingVideoCall) return;
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setIncomingVideoCall(null);
  };

  const activityIcons = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />
  };

  const activityLabels = {
    call: "Call",
    email: "Email",
    meeting: "Meeting"
  };

  const handleSubmit = () => {
    if (!formData.contact_name && !formData.contact_phone) {
      alert("Please enter a contact name or phone number");
      return;
    }
    if (!formData.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    createActivityMutation.mutate({
      ...formData,
      sales_member_email: user?.email,
      sales_member_id: user?.id
    });
  };

  const handleActivityClick = async (activity) => {
    setSelectedActivity(activity);
    setContactNotes("");
    setHubspotContact(null);
    if (activity.contact_email || activity.contact_name) {
      try {
        const res = await base44.functions.invoke('searchHubSpotContacts', {
          query: activity.contact_email || activity.contact_name
        });
        if (res.data?.contacts?.length > 0) {
          setHubspotContact(res.data.contacts[0]);
        }
      } catch (error) {
        console.error('Error searching contact:', error);
      }
    }
  };

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
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only sales team members and admins can access the activity log.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">

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

        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            {user?.type === 'sales' && (
              <ProfilePictureUpload salesMemberId={user.id} currentUrl={profilePicUrl} onUploaded={(url) => setProfilePicUrl(url)} />
            )}
            <div>
              <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>
                <span style={{ fontStyle: 'italic' }}>Arriv</span>{' '}
                <span style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#3B82F6' }}>One</span>
              </h1>
              <p className="mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>All sales activities in one place</p>
              {user?.type === 'sales' && (
                <p className="text-sm font-medium mt-1" style={{ color: '#B8956A' }}>
                  Hi {user.full_name?.split(' ')[0]}, Good {(() => {
                    const h = new Date().getHours();
                    if (h < 12) return 'Morning';
                    if (h < 17) return 'Afternoon';
                    return 'Evening';
                  })()}!
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {user?.type === 'sales' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowEditProfile(true)}>
                  Edit Profile
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowPasswordModal(true); setPasswordMsg(null); }}>
                  Change Password
                </Button>
              </>
            )}
            {activeTab === "activity" && (
              <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogTrigger asChild>
                  <Button className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                    <Plus className="w-4 h-4" />
                    Log Activity
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Log New Activity</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Activity Type</label>
                      <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Meeting</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Name *</label>
                      <Input placeholder="e.g., John Doe" value={formData.contact_name} onChange={(e) => setFormData({...formData, contact_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phone Number *</label>
                      <Input placeholder="e.g., (555) 123-4567" value={formData.contact_phone} onChange={(e) => setFormData({...formData, contact_phone: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Email</label>
                      <Input type="email" placeholder="john@example.com" value={formData.contact_email} onChange={(e) => setFormData({...formData, contact_email: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Company Name</label>
                      <Input placeholder="e.g., Acme Inc" value={formData.company_name} onChange={(e) => setFormData({...formData, company_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Date & Time</label>
                      <Input type="datetime-local" value={formData.activity_date} onChange={(e) => setFormData({...formData, activity_date: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                      <Input type="number" placeholder="0" value={formData.duration_minutes} onChange={(e) => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 0})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <Textarea placeholder="Summary of the activity..." value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={4} />
                    </div>
                    <Button onClick={handleSubmit} disabled={createActivityMutation.isPending} className="w-full">
                      {createActivityMutation.isPending ? "Logging..." : "Log Activity"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <Dialog open={showPasswordModal} onOpenChange={(open) => { setShowPasswordModal(open); if (!open) setPasswordMsg(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <div className="relative">
                  <Input type={showCurrent ? "text" : "password"} placeholder="Current password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <Input type={showNew ? "text" : "password"} placeholder="New password" value={passwordData.newPw} onChange={(e) => setPasswordData({ ...passwordData, newPw: e.target.value })} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <Input type="password" placeholder="Confirm new password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} />
              </div>
              {passwordMsg && (
                <p className={`text-sm ${passwordMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{passwordMsg.text}</p>
              )}
              <Button className="w-full" onClick={handleChangePassword}>Update Password</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex gap-2 mb-8 border-b border-[#B8956A]/20">
          {[
            { id: "activity", label: "Activity Log" },
            { id: "email", label: "Send Email" },
            { id: "contacts", label: "Contacts" },
            { id: "mycontacts", label: "My Contacts" },
            { id: "calendar", label: "Calendar" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === tab.id ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === tab.id ? '#B8956A' : 'transparent' }}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setActiveTab("call")} className="px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === "call" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "call" ? '#B8956A' : 'transparent' }}>
            <span className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              Dialer
              {(unreadSmsCount > 0 || missedCallsCount > 0) && (
                <Badge variant="destructive" className="ml-1 text-xs">{unreadSmsCount + missedCallsCount}</Badge>
              )}
            </span>
          </button>
          <button onClick={() => setActiveTab("chat")} className="px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === "chat" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "chat" ? '#B8956A' : 'transparent' }}>
            <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" />Chat</span>
          </button>
          <button onClick={() => setActiveTab("ai")} className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap" style={{ color: activeTab === "ai" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "ai" ? '#B8956A' : 'transparent' }}>
            <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" />AI Assistant</span>
          </button>
        </div>

        {activeTab === "email" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <EmailComposer salesMemberId={user?.id} isAdmin={user?.role === 'admin'} />
            </CardContent>
          </Card>
        )}

        {activeTab === "call" && (
          <Card style={{ backgroundColor: '#FFFFFF', height: '600px' }}>
            <CardContent className="pt-0 h-full">
              <IphoneDialer salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "contacts" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <ContactSearch
                salesMemberId={user?.id}
                openNewContactForm={openNewContactForm}
                setOpenNewContactForm={setOpenNewContactForm}
                prefilledData={prefilledContactData}
                onFormClosed={() => setPrefilledContactData(null)}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === "mycontacts" && (
          <MyContacts salesMemberId={user?.id} salesMemberEmail={user?.email} />
        )}

        {activeTab === "calendar" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <CalendarTab salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "ai" && (
          <AiAssistantTab repName={user?.full_name} />
        )}

        {activeTab === "chat" && (
          <div style={{ height: '600px' }} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <ChatTab 
              currentUserId={user?.id} 
              currentUserName={user?.full_name} 
              salesMemberId={user?.id} 
              isAdmin={user?.role === 'admin'}
              onInitiateTransfer={(memberId, memberName) => {
                base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
                  const ext = members?.[0]?.extension;
                  if (ext) {
                    setActiveTab("call");
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('initiateTransfer', {
                        detail: { extension: String(ext), name: memberName || members[0].full_name }
                      }));
                    }, 150);
                  }
                }).catch(() => {});
              }}
            />
          </div>
        )}

        {activeTab === "activity" && (
          <div>
            {upcomingActivities.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
                  <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
                  <Badge variant="secondary">{upcomingActivities.length}</Badge>
                </div>
                <div className="space-y-3">
                  {upcomingActivities.map((activity) => (
                    <Card key={activity.id} style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184,149,106,0.1)' }}>
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.2)' }}>
                            {activityIcons[activity.activity_type]}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" style={{ backgroundColor: 'rgba(184,149,106,0.2)', color: '#B8956A' }}>{activityLabels[activity.activity_type]}</Badge>
                              <Clock className="w-4 h-4" style={{ color: '#B8956A' }} />
                              <span className="text-sm font-medium" style={{ color: '#B8956A' }}>{format(new Date(activity.activity_date), "MMM d 'at' h:mm a")}</span>
                            </div>
                            <p className="font-medium mt-2 cursor-pointer hover:opacity-70" style={{ color: '#1A1A1A' }} onClick={() => {
                              setPrefilledContactData({
                                firstName: activity.contact_name?.split(' ')[0] || '',
                                lastName: activity.contact_name?.split(' ').slice(1).join(' ') || '',
                                email: activity.contact_email || '',
                                phone: activity.contact_phone || '',
                                company: activity.company_name || ''
                              });
                              setOpenNewContactForm(true);
                              setActiveTab("contacts");
                            }}>{activity.contact_name || activity.company_name}</p>
                            {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                            {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.company_name}</p>}
                            <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4" style={{ color: '#1A1A1A' }}>Activity History</h2>
              <div className="space-y-3">
                {pastActivities.length === 0 && upcomingActivities.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center" style={{ color: 'rgba(26,26,26,0.6)' }}>
                      No activities logged yet
                    </CardContent>
                  </Card>
                ) : (
                  pastActivities.map((activity) => (
                    <Card key={activity.id} className="cursor-pointer hover:shadow-md transition" onClick={() => handleActivityClick(activity)}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                              {activityIcons[activity.activity_type]}
                            </div>
                            <div className="flex-1">
                              <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                              <p className="font-medium mt-2 cursor-pointer hover:opacity-70" style={{ color: '#1A1A1A' }} onClick={() => {
                                setPrefilledContactData({
                                  firstName: activity.contact_name?.split(' ')[0] || '',
                                  lastName: activity.contact_name?.split(' ').slice(1).join(' ') || '',
                                  email: activity.contact_email || '',
                                  phone: activity.contact_phone || '',
                                  company: activity.company_name || ''
                                });
                                setOpenNewContactForm(true);
                                setActiveTab("contacts");
                              }}>{activity.contact_name || activity.company_name}</p>
                              {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                              {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.company_name}</p>}
                              <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}</p>
                              {activity.duration_minutes > 0 && (
                                <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.duration_minutes} minutes</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap" style={{ color: 'rgba(26,26,26,0.6)' }}>
                            {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
            </DialogHeader>
            {selectedActivity && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">Activity</h3>
                  <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                    <p><span className="font-medium">Type:</span> {activityLabels[selectedActivity.activity_type]}</p>
                    <p><span className="font-medium">Date:</span> {format(new Date(selectedActivity.activity_date), "MMM d, yyyy h:mm a")}</p>
                    <p><span className="font-medium">Notes:</span> {selectedActivity.notes.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}</p>
                    {selectedActivity.duration_minutes > 0 && (
                      <p><span className="font-medium">Duration:</span> {selectedActivity.duration_minutes} minutes</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-3">Contact Information</h3>
                  <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                    {selectedActivity.contact_name && <p><span className="font-medium">Name:</span> {selectedActivity.contact_name}</p>}
                    {selectedActivity.contact_email && <p><span className="font-medium">Email:</span> {selectedActivity.contact_email}</p>}
                    {selectedActivity.contact_phone && <p><span className="font-medium">Phone:</span> {selectedActivity.contact_phone}</p>}
                    {selectedActivity.company_name && <p><span className="font-medium">Company:</span> {selectedActivity.company_name}</p>}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-3">Actions</h3>
                  <div className="flex gap-2 flex-wrap">
                    {(selectedActivity.contact_phone || selectedActivity.contact_name) && (
                      <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }} onClick={() => { setActiveTab("call"); setSelectedActivity(null); }}>
                        <Phone className="w-4 h-4" /> Call
                      </Button>
                    )}
                    {selectedActivity.contact_email && (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => { setActiveTab("email"); setSelectedActivity(null); }}>
                        <Mail className="w-4 h-4" /> Email
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                      setPrefilledContactData({
                        firstName: selectedActivity.contact_name?.split(' ')[0] || '',
                        lastName: selectedActivity.contact_name?.split(' ').slice(1).join(' ') || '',
                        email: selectedActivity.contact_email || '',
                        phone: selectedActivity.contact_phone || '',
                        company: selectedActivity.company_name || ''
                      });
                      setOpenNewContactForm(true);
                      setActiveTab("contacts");
                      setSelectedActivity(null);
                    }}>
                      <Plus className="w-4 h-4" /> Add Contact Info
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <EditMyProfileModal
          salesMemberId={user?.id}
          open={showEditProfile}
          onClose={() => setShowEditProfile(false)}
        />

        <PoweredByFooter />

        {/* Incoming video call notification */}
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
            onClose={() => setActiveVideoCall(null)}
            onMinimize={() => {
              setMinimizedVideoCall(activeVideoCall);
              setActiveVideoCall(null);
            }}
            onChatOpenRequest={() => {}}
          />
        )}

        {/* Minimized video call indicator */}
        {minimizedVideoCall && !activeVideoCall && (
          <button
            onClick={() => setActiveVideoCall(minimizedVideoCall)}
            className="fixed bottom-4 right-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg z-[249] transition-colors"
            title="Restore video call"
          >
            📞 Restore Call
          </button>
        )}

        {activeTab !== "chat" && (
          <FloatingChatBubble
            currentUserId={user?.id}
            currentUserName={user?.full_name}
            isVideoActive={!!activeVideoCall}
            onOpenChat={() => {
              // This is for opening chat inside the video call, not switching tabs
              // The video call component handles the chat opening via onChatOpenRequest
            }}
            onInitiateTransfer={(memberId, memberName) => {
              base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
                const ext = members?.[0]?.extension;
                if (ext) {
                  setActiveTab("call");
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('initiateTransfer', {
                      detail: { extension: String(ext), name: memberName || members[0].full_name }
                    }));
                  }, 150);
                }
              }).catch(() => {});
            }}
          />
        )}

      </div>
    </div>
  );
}