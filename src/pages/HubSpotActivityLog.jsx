import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import CallStateBadge from "@/components/sales/CallStateBadge";
import { useCallStatus } from "@/components/CallStatusContext";

export default function HubSpotActivityLog() {
  const { setCallStatus: setContextCallStatus } = useCallStatus();
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    activity_type: "call",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0
  });
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
  const [isVideoWindowOpen, setIsVideoWindowOpen] = useState(false);
  const [videoListenerReady, setVideoListenerReady] = useState(false);
  const [lastIncomingNotificationId, setLastIncomingNotificationId] = useState(null);
  const [lastHandledNotificationId, setLastHandledNotificationId] = useState(null); // Dedupe prevention
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [lastCallEvent, setLastCallEvent] = useState("");
  const [editingActivity, setEditingActivity] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [uploadingPictures, setUploadingPictures] = useState(false);
  const [formPictureUrls, setFormPictureUrls] = useState([]);

  // Derive isInLiveCall from callStatus (single source of truth)
  const isInLiveCall = callStatus !== 'idle';
  
  // Sync local callStatus to context
  useEffect(() => {
    setContextCallStatus(callStatus);
  }, [callStatus, setContextCallStatus]);

  const queryClient = useQueryClient();

  // Centralized idempotent call teardown
  const endVideoCall = (reason) => {
    setLastCallEvent(reason || 'LOCAL_END');
    setCallStatus("idle");
    setIsVideoWindowOpen(false);
    setActiveVideoCall(null);
    setIncomingVideoCall(null);
    setHasUnreadNotification(false);
  };


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

      // Initialize Twilio Video device and listener on mount
          const initializeVideoDevice = async () => {
            try {
              let attempts = 0;
              while (!window.Twilio?.Video && attempts < 50) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
              }
              if (!window.Twilio?.Video) {
                console.error('[HUBSPOT_VIDEO_INIT] Twilio SDK failed to load');
                return;
              }
              console.log('[HUBSPOT_VIDEO_INIT] Twilio SDK available, device listener initialized');
              setVideoListenerReady(true);
            } catch (err) {
              console.error('[HUBSPOT_VIDEO_INIT] Failed to initialize video device:', err);
            }
          };

          // Load SDK and initialize device
          if (window.Twilio?.Video) {
            initializeVideoDevice();
          } else {
            const script = document.createElement("script");
            script.src = "https://sdk.twilio.com/js/video/releases/2.28.0/twilio-video.min.js";
            script.async = true;
            script.onload = () => {
              console.log('[HUBSPOT_VIDEO_INIT] Twilio SDK loaded, initializing device');
              initializeVideoDevice();
            };
            script.onerror = () => {
              console.error('[HUBSPOT_VIDEO_INIT] Failed to load Twilio SDK');
            };
            document.head.appendChild(script);
          }

          // Load existing unread incoming video calls and mark them as read immediately to prevent resurfacing
          base44.entities.PendingNotification.filter({
            recipient_id: salesMemberId,
            event_type: 'incoming_video_call',
            is_read: false
          }).then(existing => {
            if (existing?.[0]) {
              console.log(`[HUBSPOT_ACTIVITY] Found existing unread incoming call notification, marking as read:`, existing[0].id);
              base44.entities.PendingNotification.update(existing[0].id, { is_read: true }).catch(e => console.error('Failed to mark notification as read:', e));
            }
          }).catch(() => {});

          // Listen for incoming video call notifications (STRICTLY create events only)
          const videoCallSub = base44.entities.PendingNotification.subscribe((event) => {
            console.log(`[HUBSPOT_ACTIVITY] PendingNotification event:`, {
              type: event.type,
              event_type: event.data?.event_type,
              notificationId: event.id,
              recipient_id: event.data?.recipient_id,
              current_userId: salesMemberId,
              matches: event.data?.recipient_id === salesMemberId && event.type === 'create'
            });
            // When we initiated an outgoing call, hide the chat bubble immediately
            if (event.type === 'create' && event.data?.event_type === 'outgoing_video_call' && event.data?.recipient_id === salesMemberId) {
              setCallStatus("calling");
              setLastCallEvent('OUTBOUND_INITIATED');
              return;
            }

            // ONLY handle CREATE events for incoming_video_call, and only if we haven't handled this notification before
            if (event.type === 'create' && event.data?.event_type === 'incoming_video_call' && event.data?.recipient_id === salesMemberId && lastHandledNotificationId !== event.id) {
              const d = event.data.event_data;
              setLastIncomingNotificationId(event.id);
              setLastHandledNotificationId(event.id); // Mark as handled to prevent re-triggering
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

  // Load contacts when form opens
  useEffect(() => {
    if (!showForm || !user?.id) return;
    setLoadingContacts(true);
    base44.entities.ActivityLog.filter({ sales_member_id: user.id }, '-activity_date', 100)
      .then(logs => {
        const uniqueContacts = {};
        logs?.forEach(log => {
          if (log.contact_email && !uniqueContacts[log.contact_email]) {
            uniqueContacts[log.contact_email] = {
              email: log.contact_email,
              name: log.contact_name,
              company: log.company_name
            };
          }
        });
        setContacts(Object.values(uniqueContacts).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      })
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [showForm, user?.id]);

  const selectedContactObj = selectedContact
    ? contacts.find(c => c.email === selectedContact)
    : null;

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

  const pastActivities = [...activities]
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.created_date || b.activity_date) - new Date(a.created_date || a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.ActivityLog.create(data);
      await base44.functions.invoke('syncActivityToHubSpot', { activityId: result.id });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setShowForm(false);
      setShowSuccessDialog(true);
      setSelectedContact(null);
      setFormPictureUrls([]);
      setFormData({
        activity_type: "call",
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
    setCallStatus("connecting");
    setHasUnreadNotification(false);
    setActiveVideoCall(incomingVideoCall);
    setLastCallEvent('ACCEPT_INBOUND');
    setCallStatus("connected");
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setIsVideoWindowOpen(true);
    setIncomingVideoCall(null);
    setVideoCallProcessing(false);
  };

  const handleDeclineVideoCall = async () => {
    if (!incomingVideoCall) return;
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setIncomingVideoCall(null);
    setCallStatus("idle");
    setHasUnreadNotification(false);
  };

  const activityIcons = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />
  };

  const activityLabels = {
    call: "Call",
    email: "Email",
    meeting: "Meeting",
    task: "Task",
    note: "Note"
  };

  const handlePictureChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingPictures(true);
    try {
      for (const file of files) {
        const result = await base44.integrations.Core.UploadFile({ file });
        const url = result?.file_url || result?.data?.file_url;
        if (url) setFormPictureUrls(prev => [...prev, url]);
      }
    } catch (error) {
      console.error('Picture upload error:', error);
    } finally {
      setUploadingPictures(false);
      e.target.value = "";
    }
  };

  const handleSubmit = () => {
    if (!formData.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    createActivityMutation.mutate({
      ...formData,
      picture_urls: formPictureUrls,
      contact_name: selectedContactObj?.name || "",
      contact_email: selectedContactObj?.email || "",
      company_name: selectedContactObj?.company || "",
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

  const handleEditActivity = (activity) => {
    setEditingActivity(activity.id);
    setEditFormData(activity);
  };

  const handleSaveEdit = async () => {
    if (!editFormData?.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    try {
      await base44.entities.ActivityLog.update(editFormData.id, editFormData);
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setSelectedActivity(editFormData);
      setEditingActivity(null);
      setEditFormData(null);
    } catch (error) {
      alert("Failed to save activity: " + error.message);
    }
  };

  const handleDeleteActivity = async (activity) => {
    if (window.confirm("Are you sure you want to delete this activity?")) {
      try {
        await base44.entities.ActivityLog.delete(activity.id);
        queryClient.invalidateQueries({ queryKey: ['activities'] });
        setSelectedActivity(null);
      } catch (error) {
        alert("Failed to delete activity: " + error.message);
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
                      <label className="block text-sm font-medium mb-1">Contact</label>
                      <Select value={selectedContact || ""} onValueChange={setSelectedContact} disabled={loadingContacts}>
                        <SelectTrigger><SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select a contact (optional)"} /></SelectTrigger>
                        <SelectContent>
                          {contacts.map((c) => (
                            <SelectItem key={c.email} value={c.email}>
                              {c.name} {c.company ? `(${c.company})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Activity Type</label>
                      <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Meeting</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                          <SelectItem value="note">Note</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <div>
                      <label className="block text-sm font-medium mb-1">Pictures</label>
                      <Input type="file" accept="image/*" multiple onChange={handlePictureChange} disabled={uploadingPictures} />
                      {uploadingPictures && <p className="text-xs text-gray-500 mt-1">Uploading pictures...</p>}
                      {formPictureUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {formPictureUrls.map((url, i) => (
                            <img key={i} src={url} alt="Preview" className="rounded-lg max-h-20 w-auto" />
                          ))}
                        </div>
                      )}
                    </div>
                    <Button onClick={handleSubmit} disabled={createActivityMutation.isPending || uploadingPictures} className="w-full">
                      {uploadingPictures ? "Uploading pictures..." : createActivityMutation.isPending ? "Logging..." : "Log Activity"}
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

        {activeTab === "chat" && !isInLiveCall && (
           <div style={{ height: '600px' }} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
             <ChatTab 
               currentUserId={user?.id} 
               currentUserName={user?.full_name} 
               salesMemberId={user?.id} 
               isAdmin={user?.role === 'admin'}
               onVideoCallStarted={(data) => {
                 if (data && typeof data === 'object' && data.roomName) {
                   setLastCallEvent('OUTBOUND_START');
                   setCallStatus("calling");
                   setActiveVideoCall({ callerName: data.recipientName || "Video Call", roomName: data.roomName, recipientToken: data.token });
                   setIsVideoWindowOpen(true);
                 } else {
                   setLastCallEvent('OUTBOUND_START');
                   setCallStatus(data || "dialing");
                   setActiveVideoCall({ callerName: "Video Call" });
                 }
               }}
               onVideoCallEnded={endVideoCall}
               endVideoCall={endVideoCall}
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
                    <Card 
                      key={activity.id} 
                      style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184,149,106,0.1)' }}
                      className="cursor-pointer hover:shadow-md transition"
                      onClick={() => handleActivityClick(activity)}
                    >
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
                            <p className="font-medium mt-2 cursor-pointer hover:opacity-70" style={{ color: '#1A1A1A' }} onClick={(e) => {
                              e.stopPropagation();
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

        {/* Success Dialog */}
        <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
          <DialogContent className="max-w-sm text-center">
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">✅ Activity Logged!</DialogTitle>
            </DialogHeader>
            <p className="text-gray-600 mt-2">Your activity has been saved successfully.</p>
            <Button className="mt-4 w-full" style={{ backgroundColor: '#B8956A', color: '#fff' }} onClick={() => setShowSuccessDialog(false)}>Done</Button>
          </DialogContent>
        </Dialog>

        {/* Image Zoom Overlay - rendered in portal above ALL Radix dialogs */}
        {zoomedImage && createPortal(
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', pointerEvents: 'all' }}
            onClick={(e) => { e.stopPropagation(); setZoomedImage(null); }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
              <button
                style={{ position: 'absolute', top: '-12px', right: '-12px', background: 'rgba(0,0,0,0.8)', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setZoomedImage(null)}
              >✕</button>
              <img src={zoomedImage} alt="Zoomed" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '12px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', display: 'block' }} />
            </div>
          </div>,
          document.body
        )}

        <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open && !zoomedImage) { setSelectedActivity(null); setEditingActivity(null); } }}>
           <DialogContent className="max-w-2xl" onInteractOutside={(e) => { if (zoomedImage) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (zoomedImage) e.preventDefault(); }}>
             <DialogHeader>
               <div className="flex justify-between items-center">
                 <DialogTitle>Activity Details</DialogTitle>
                 {selectedActivity && !editingActivity && (
                   <div className="flex gap-2">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => handleEditActivity(selectedActivity)}
                     >
                       Edit
                     </Button>
                     <Button
                       variant="destructive"
                       size="sm"
                       onClick={() => handleDeleteActivity(selectedActivity)}
                     >
                       Delete
                     </Button>
                   </div>
                 )}
               </div>
             </DialogHeader>
             {selectedActivity && !editingActivity && (
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
                     {selectedActivity.picture_urls && selectedActivity.picture_urls.length > 0 && (
                      <div>
                        <p className="font-medium mb-2">Pictures:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedActivity.picture_urls.map((url, idx) => (
                            <img key={idx} src={url} alt={`Activity ${idx + 1}`} className="rounded-lg max-h-48 w-auto cursor-zoom-in hover:opacity-90 transition" onClick={() => setZoomedImage(url)} />
                          ))}
                        </div>
                      </div>
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
             {editingActivity && editFormData && (
               <div className="space-y-4">
                 <div>
                   <label className="block text-sm font-medium mb-1">Activity Type</label>
                   <Select value={editFormData.activity_type} onValueChange={(val) => setEditFormData({...editFormData, activity_type: val})}>
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="call">Call</SelectItem>
                       <SelectItem value="email">Email</SelectItem>
                       <SelectItem value="meeting">Meeting</SelectItem>
                       <SelectItem value="task">Task</SelectItem>
                       <SelectItem value="note">Note</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>

                 <div>
                   <label className="block text-sm font-medium mb-1">Date & Time</label>
                   <Input
                     type="datetime-local"
                     value={editFormData.activity_date}
                     onChange={(e) => setEditFormData({...editFormData, activity_date: e.target.value})}
                   />
                 </div>

                 <div>
                   <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                   <Input
                     type="number"
                     placeholder="0"
                     value={editFormData.duration_minutes}
                     onChange={(e) => setEditFormData({...editFormData, duration_minutes: parseInt(e.target.value) || 0})}
                   />
                 </div>

                 <div>
                   <label className="block text-sm font-medium mb-1">Notes</label>
                   <Textarea
                     placeholder="Summary of the activity..."
                     value={editFormData.notes}
                     onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                     rows={4}
                   />
                 </div>

                 {editFormData.picture_urls && editFormData.picture_urls.length > 0 && (
                   <div>
                     <label className="block text-sm font-medium mb-2">Pictures</label>
                     <div className="flex flex-wrap gap-2">
                       {editFormData.picture_urls.map((url, idx) => (
                         <img key={idx} src={url} alt={`Activity ${idx + 1}`} className="rounded-lg max-h-48 w-auto" />
                       ))}
                     </div>
                   </div>
                 )}

                 <div className="flex gap-2">
                   <Button
                     variant="outline"
                     onClick={() => {
                       setEditingActivity(null);
                       setEditFormData(null);
                     }}
                     className="flex-1"
                   >
                     Cancel
                   </Button>
                   <Button
                     onClick={handleSaveEdit}
                     className="flex-1"
                     style={{ backgroundColor: '#B8956A', color: '#fff' }}
                   >
                     Save Changes
                   </Button>
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

        {/* Active video call panel - always render if call active, but VideoCallPanelV2 handles visibility */}
        {activeVideoCall && (
          <VideoCallPanelV2
            recipientName={activeVideoCall.callerName}
            callerToken={activeVideoCall.recipientToken}
            roomName={activeVideoCall.roomName}
            currentUserName={user?.full_name}
            currentUserId={user?.id}
            isIncoming={true}
            autoStart={true}
            onClose={() => endVideoCall("user_ended")}
            onMinimize={() => setIsVideoWindowOpen(false)}
            isVideoWindowOpen={isVideoWindowOpen}
            onChatOpenRequest={() => {}}
          />
        )}

        {/* Minimized video call indicator - positioned to not conflict with chat bubble (bottom-4 right-4) */}
        {activeVideoCall && !isVideoWindowOpen && (
          <div className="fixed bottom-4 left-4 z-[99999] flex flex-col gap-2">
            <button
              onClick={() => setIsVideoWindowOpen(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg transition-colors"
              title="Restore video call"
            >
              📞 Return to Call
            </button>
            <button
              onClick={() => endVideoCall("user_ended")}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg transition-colors"
              title="End call"
            >
              ✕ End Call
            </button>
          </div>
        )}

        {/* Chat bubble - hidden during live call, disabled when video call active */}
         {((callStatus === 'idle') || hasUnreadNotification) && (
            <FloatingChatBubble
              currentUserId={user?.id}
              currentUserName={user?.full_name}
              isVideoCallActive={false}
              onOpenChat={() => {}}
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