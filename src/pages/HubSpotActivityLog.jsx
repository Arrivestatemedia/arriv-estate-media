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
import { Plus, Phone, Mail, Calendar, Clock, Zap, MessageSquare, Eye, EyeOff, Sparkles, Archive, ChevronDown, ChevronUp } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import EmailComposer from "@/components/sales/EmailComposer";
import IphoneDialer from "@/components/sales/IphoneDialer";
import ContactSearch from "@/components/sales/ContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import ChatTab from "@/components/sales/ChatTab";
import CalendarTab from "@/components/sales/CalendarTab";
import AiAssistantTab from "@/components/sales/AiAssistantTab";
import ProspectingTab from "@/components/sales/ProspectingTab";
import DailyCallQueue from "@/components/sales/DailyCallQueue";
import PoweredByFooter from "@/components/PoweredByFooter";
import CallMapModal from "@/components/sales/CallMapModal";
import ActivityArchive from "@/components/sales/ActivityArchive";
import FloatingChatBubble from "@/components/sales/FloatingChatBubble";
import TrainingTab from "@/components/sales/TrainingTab";
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
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "activity";
  });
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
  const [callMapActivity, setCallMapActivity] = useState(null); // activity whose call map to show
  const [regeneratingCallMap, setRegeneratingCallMap] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleOnCurrentPage, setVisibleOnCurrentPage] = useState(5);
  const [showArchive, setShowArchive] = useState(false);
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
      window.location.replace('/SalesLogin');
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

    const handleSwitchToQueue = () => setActiveTab("queue");

    window.addEventListener('openContact', handleOpenContact);
    window.addEventListener('openDialer', handleOpenDialer);
    window.addEventListener('openEmailComposer', handleOpenEmailComposer);
    window.addEventListener('switchToQueueTab', handleSwitchToQueue);

    // Check if NotificationPanel stored a queue switch flag
    const switchToQueue = sessionStorage.getItem('_switchToQueue');
    if (switchToQueue === 'true') {
      sessionStorage.removeItem('_switchToQueue');
      setActiveTab('queue');
    }

    return () => {
      window.removeEventListener('openContact', handleOpenContact);
      window.removeEventListener('openDialer', handleOpenDialer);
      window.removeEventListener('openEmailComposer', handleOpenEmailComposer);
      window.removeEventListener('switchToQueueTab', handleSwitchToQueue);
    };
  }, []);

  // Load contacts when form opens
  useEffect(() => {
    if (!showForm || !user?.id) return;
    setLoadingContacts(true);
    base44.entities.ActivityLog.filter({ sales_member_id: user.id }, '-activity_date', 100)
      .then(logs => {
        const isPhoneOrExtension = (name) => !name || /^[+\d\s\-().]+$/.test(name.trim()) || /^\d{1,4}$/.test(name.trim());
        const uniqueContacts = {};
        logs?.forEach(log => {
          if (isPhoneOrExtension(log.contact_name) && !log.contact_email) return;
          const key = log.contact_email || log.contact_name;
          if (key && !uniqueContacts[key]) {
            uniqueContacts[key] = {
              email: log.contact_email || "",
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
    ? contacts.find(c => (c.email && c.email === selectedContact) || (c.name && c.name === selectedContact))
    : null;

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.email],
    queryFn: async () => {
      const allActivities = await base44.entities.ActivityLog.filter({ sales_member_id: user?.id }, '-activity_date', 500);
      return allActivities || [];
    },
    initialData: [],
    enabled: !!user,
  });

  // Subscribe to ActivityLog changes for real-time call map updates
  useEffect(() => {
    if (!user?.id) return;
    
    const unsubscribe = base44.entities.ActivityLog.subscribe((event) => {
      if (event.data?.sales_member_id === user.id) {
        queryClient.invalidateQueries({ queryKey: ['activities', user?.email] });
      }
    });
    
    return unsubscribe;
  }, [user?.id, user?.email, queryClient]);

  // Build a phone lookup from entire history
  const phoneLookup = {};
  activities.forEach(a => {
    if (a.contact_email && a.contact_phone) {
      phoneLookup[a.contact_email] = a.contact_phone;
    }
    if (a.contact_name && a.contact_phone) {
      phoneLookup[a.contact_name] = a.contact_phone;
    }
  });

  // Enrich upcoming activities with phone from HubSpot or history
  const [hubspotPhoneLookup, setHubspotPhoneLookup] = useState({});
  
  useEffect(() => {
    const upcomingEmails = activities
      .filter(a => new Date(a.activity_date) > new Date() && a.contact_email && !a.contact_phone)
      .map(a => a.contact_email)
      .filter((v, i, a) => a.indexOf(v) === i); // unique emails

    if (upcomingEmails.length > 0) {
      Promise.all(upcomingEmails.map(email =>
        base44.functions.invoke('searchHubSpotContacts', { query: email })
          .then(res => ({ email, phone: res.data?.contacts?.[0]?.phone || '' }))
          .catch(() => ({ email, phone: '' }))
      )).then(results => {
        const lookup = {};
        results.forEach(({ email, phone }) => {
          if (phone) lookup[email] = phone;
        });
        setHubspotPhoneLookup(lookup);
      });
    }
  }, [activities]);

  const [expandedUpcoming, setExpandedUpcoming] = useState({});
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [visibleUpcomingOnPage, setVisibleUpcomingOnPage] = useState(5);

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .map(a => {
      const phone = a.contact_phone || hubspotPhoneLookup[a.contact_email] || phoneLookup[a.contact_email] || phoneLookup[a.contact_name] || '';
      return { ...a, contact_phone: phone };
    });

  const pastActivities = [...activities]
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.created_date || b.activity_date) - new Date(a.created_date || a.activity_date))
    .map(a => {
      const phone = a.contact_phone || hubspotPhoneLookup[a.contact_email] || phoneLookup[a.contact_email] || phoneLookup[a.contact_name] || '';
      return { ...a, contact_phone: phone };
    });

  const itemsPerPage = 10;
  const startIdx = currentPage * itemsPerPage;
  const endIdx = startIdx + visibleOnCurrentPage;
  const currentPageActivities = pastActivities.slice(startIdx, endIdx);
  const totalPages = Math.ceil(pastActivities.length / itemsPerPage);



  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.ActivityLog.create(data);
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
      contact_phone: selectedContactObj?.phone || formData.contact_phone || "",
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

        <div className="flex flex-wrap justify-between items-start gap-3 mb-8">
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
          <div className="flex flex-wrap gap-2 items-center">
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
                 <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                   <DialogHeader>
                     <DialogTitle>Log New Activity</DialogTitle>
                   </DialogHeader>
                   <div className="space-y-3 sm:space-y-4 pb-24 sm:pb-0">
                     <div>
                       <label className="block text-sm font-medium mb-1">Contact</label>
                       <Select value={selectedContact || ""} onValueChange={setSelectedContact} disabled={loadingContacts}>
                         <SelectTrigger className="w-full"><SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select a contact (optional)"} /></SelectTrigger>
                         <SelectContent>
                           {contacts.map((c) => (
                               <SelectItem key={c.email || c.name} value={c.email || c.name}>
                                 {c.name} {c.company ? `(${c.company})` : ""} {c.phone ? `${c.phone}` : ""}
                               </SelectItem>
                             ))}
                         </SelectContent>
                       </Select>
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1">Phone (optional)</label>
                       <Input 
                         type="tel" 
                         placeholder="Contact phone number" 
                         value={formData.contact_phone || ""} 
                         onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                         className="w-full"
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1">Activity Type</label>
                       <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
                         <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                       <Input type="datetime-local" value={formData.activity_date} onChange={(e) => setFormData({...formData, activity_date: e.target.value})} className="w-full text-xs sm:text-sm h-10 sm:h-9" />
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                       <Input type="number" placeholder="0" value={formData.duration_minutes} onChange={(e) => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 0})} className="w-full" />
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1">Notes</label>
                       <Textarea placeholder="Summary of the activity..." value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="w-full text-sm" />
                     </div>
                     <div>
                       <label className="block text-sm font-medium mb-1">Pictures</label>
                       <Input type="file" accept="image/*" multiple onChange={handlePictureChange} disabled={uploadingPictures} className="w-full text-xs" />
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

        <div className="flex gap-2 mb-8 border-b border-[#B8956A]/20 overflow-x-auto whitespace-nowrap">
          {[
            { id: "activity", label: "Activity Log" },
            { id: "email", label: "Email Hub" },
            { id: "contacts", label: "Search/Add Contacts" },
            { id: "mycontacts", label: "My Contacts" },
            { id: "queue", label: "Call Queue" },
            { id: "calendar", label: "Calendar" },
            { id: "prospect", label: "Prospecting" },
            { id: "training", label: "Training" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="shrink-0 px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === tab.id ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === tab.id ? '#B8956A' : 'transparent' }}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setActiveTab("call")} className="shrink-0 px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === "call" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "call" ? '#B8956A' : 'transparent' }}>
            <span className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              Dialer
              {(unreadSmsCount > 0 || missedCallsCount > 0) && (
                <Badge variant="destructive" className="ml-1 text-xs">{unreadSmsCount + missedCallsCount}</Badge>
              )}
            </span>
          </button>
          <button onClick={() => setActiveTab("chat")} className="shrink-0 px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === "chat" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "chat" ? '#B8956A' : 'transparent' }}>
            <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" />Chat</span>
          </button>
          <button onClick={() => setActiveTab("ai")} className="shrink-0 px-4 py-3 font-medium border-b-2 transition" style={{ color: activeTab === "ai" ? '#B8956A' : 'rgba(26,26,26,0.6)', borderBottomColor: activeTab === "ai" ? '#B8956A' : 'transparent' }}>
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

        {activeTab === "queue" && (
          <DailyCallQueue salesMemberId={user?.id} salesMemberEmail={user?.email} repName={user?.full_name} />
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

        <div className={activeTab === "prospect" ? "" : "hidden"}>
          <ProspectingTab salesMemberId={user?.id} active={activeTab === "prospect"} />
        </div>

        {activeTab === "training" && <TrainingTab />}

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

        {activeTab === "activity" && showArchive && (
          <ActivityArchive
            salesMemberId={user?.id}
            salesMemberEmail={user?.email}
            onClose={() => setShowArchive(false)}
          />
        )}

        {activeTab === "activity" && !showArchive && (
          <DragDropContext onDragEnd={(result) => {
            const { source, destination, draggableId } = result;
            if (!destination || source.droppableId === destination.droppableId) return;
            const activity = activities.find(a => a.id === draggableId);
            if (!activity) return;

            if (destination.droppableId === 'history') {
              // Synchronous move to history
              const newDate = new Date(Date.now() - 60000).toISOString();
              base44.entities.ActivityLog.update(activity.id, { activity_date: newDate })
                .then(() => queryClient.invalidateQueries({ queryKey: ['activities'] }));
            } else {
              // Optimistically set to tomorrow 10am ET, then let AI refine in background
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 1);
              const yr = tomorrow.getUTCFullYear();
              const isDST = tomorrow >= new Date(Date.UTC(yr, 2, 8)) && tomorrow < new Date(Date.UTC(yr, 10, 1));
              tomorrow.setUTCHours(10 + (isDST ? 4 : 5), 0, 0, 0);
              const optimisticDate = tomorrow.toISOString();

              // Save optimistic date immediately so drag completes visually
              base44.entities.ActivityLog.update(activity.id, { activity_date: optimisticDate })
                .then(() => queryClient.invalidateQueries({ queryKey: ['activities'] }));

              // Now run AI in background to pick a smarter time
              const contactKey = activity.contact_email || activity.contact_name;
              const contactHistory = activities
                .filter(a => (a.contact_email && a.contact_email === contactKey) || (a.contact_name && a.contact_name === contactKey))
                .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
                .slice(0, 20)
                .map(a => {
                  const dt = new Date(a.activity_date);
                  const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                  const note = (a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim().slice(0, 200);
                  return `${etStr} [${a.activity_type}]: ${note}`;
                })
                .join('\n');
              const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

              base44.integrations.Core.InvokeLLM({
                prompt: `You are a sales scheduling AI. Analyze this contact's full history and pick the BEST specific date+time (ET) to schedule a follow-up call.

TODAY (ET): ${todayET}
CONTACT: ${activity.contact_name || activity.contact_email}
FULL ACTIVITY HISTORY (most recent first):
${contactHistory || 'No history.'}

ANALYSIS INSTRUCTIONS:
- Look for patterns: what times/days were calls actually answered vs missed?
- Read the notes carefully: did they say "call me back at X time", "I'm usually free in the afternoon", "mornings are better", "I'm at showings until noon", etc.?
- Look at when real-time conversations happened (these are the times they were actually available)
- Consider their industry patterns (real estate agents are often busy on weekends and evenings with showings)
- Must be tomorrow or later, Monday–Friday, between 8am–6pm ET
- If no useful patterns exist, default to tomorrow at 10am ET

Return ONLY valid JSON, no extra text:
{"iso_date": "YYYY-MM-DDTHH:mm:00", "reason": "brief reason based on what you found in the notes/patterns"}`,
                response_json_schema: {
                  type: 'object',
                  properties: { iso_date: { type: 'string' }, reason: { type: 'string' } },
                  required: ['iso_date', 'reason']
                }
              }).then(llmResult => {
                const schedData = typeof llmResult === 'string' ? JSON.parse(llmResult) : llmResult;
                const etDate = new Date(schedData.iso_date);
                const yr2 = etDate.getUTCFullYear();
                const isDST2 = etDate >= new Date(Date.UTC(yr2, 2, 8)) && etDate < new Date(Date.UTC(yr2, 10, 1));
                etDate.setTime(etDate.getTime() + (isDST2 ? 4 : 5) * 3600000);
                const minDate = new Date();
                minDate.setDate(minDate.getDate() + 1);
                const finalDate = etDate > minDate ? etDate.toISOString() : minDate.toISOString();
                return base44.entities.ActivityLog.update(activity.id, { activity_date: finalDate });
              }).then(() => queryClient.invalidateQueries({ queryKey: ['activities'] })).catch(() => {});
            }
          }}>
          <div>
            {/* ── UPCOMING TASKS ── */}
            <Droppable droppableId="upcoming">
              {(provided, snapshot) => {
                return (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="mb-8"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
                    <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
                    <Badge variant="secondary">{upcomingActivities.length}</Badge>
                    <span className="text-xs ml-1" style={{ color: 'rgba(26,26,26,0.4)' }}>drag to move</span>
                  </div>
                  {upcomingActivities.length === 0 && (
                    <div
                      className="rounded-xl border-2 border-dashed flex items-center justify-center h-16 text-sm transition-all"
                      style={{ borderColor: snapshot.isDraggingOver ? '#B8956A' : 'rgba(184,149,106,0.3)', color: 'rgba(26,26,26,0.4)', backgroundColor: snapshot.isDraggingOver ? 'rgba(184,149,106,0.06)' : 'transparent' }}
                    >
                      Drop here to reschedule as upcoming
                    </div>
                  )}
                  <div className="space-y-3">
                    {upcomingActivities.slice(upcomingPage * 5, upcomingPage * 5 + visibleUpcomingOnPage).map((activity, index) => {
                      const displayPhone = activity.contact_phone || phoneLookup[activity.contact_email] || phoneLookup[activity.contact_name] || '';
                      return (
                        <Draggable key={activity.id} draggableId={activity.id} index={upcomingPage * 5 + index}>
                          {(dragProvided, dragSnapshot) => {
                            const isExpanded = expandedUpcoming[activity.id];
                            const raw = activity.notes || '';
                            const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                            const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                            return (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              style={{ ...dragProvided.draggableProps.style, opacity: dragSnapshot.isDragging ? 0.85 : 1 }}
                            >
                              <Card
                                style={{ borderColor: '#B8956A', backgroundColor: dragSnapshot.isDragging ? 'rgba(184,149,106,0.2)' : 'rgba(184,149,106,0.1)' }}
                                className="hover:shadow-md transition cursor-pointer"
                                onClick={() => {
                                  if (isExpanded) {
                                    handleActivityClick(activity);
                                  } else {
                                    setExpandedUpcoming(prev => ({ ...prev, [activity.id]: true }));
                                  }
                                }}
                              >
                                <CardContent className="pt-4 pb-4">
                                  {/* Collapsed row */}
                                  <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.2)' }}>
                                      {activityIcons[activity.activity_type]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" style={{ backgroundColor: 'rgba(184,149,106,0.2)', color: '#B8956A' }}>{activityLabels[activity.activity_type]}</Badge>
                                        <span className="text-xs font-medium" style={{ color: '#B8956A' }}>{format(new Date(activity.activity_date), "MMM d 'at' h:mm a")}</span>
                                      </div>
                                      <p className="font-medium text-sm mt-0.5 truncate" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                                      {activity.company_name && activity.contact_name && <p className="text-xs truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>{activity.company_name}</p>}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setExpandedUpcoming(prev => ({ ...prev, [activity.id]: !isExpanded })); }}
                                      className="shrink-0 p-1"
                                      style={{ color: 'rgba(26,26,26,0.4)' }}
                                    >
                                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                  </div>

                                  {/* Expanded details */}
                                  {isExpanded && (
                                    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(184,149,106,0.3)' }} onClick={(e) => e.stopPropagation()}>
                                      {activity.contact_email && <p className="text-sm mb-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                                      {displayPhone ? (
                                        <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('_dialerPhone', displayPhone); setActiveTab("call"); }} className="flex items-center gap-1 text-xs font-medium mb-2 hover:opacity-70 transition-opacity" style={{ color: '#B8956A' }}>
                                          <Phone className="w-3 h-3" /><span>{displayPhone}</span>
                                        </button>
                                      ) : (
                                        <span className="text-xs mb-2 block" style={{ color: 'rgba(26,26,26,0.4)' }}>No phone on file</span>
                                      )}
                                      {shortNote && <p className="text-sm mb-2" style={{ color: '#1A1A1A' }}>{shortNote.slice(0, 150)}{shortNote.length > 150 ? '...' : ''}</p>}
                                      <div className="flex gap-2 flex-wrap">
                                        {hasCallMap && (
                                          <button onClick={(e) => { e.stopPropagation(); setCallMapActivity(activity); }} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}>
                                            📋 View Call Map
                                          </button>
                                        )}
                                        <button onClick={() => handleActivityClick(activity)} className="text-xs font-medium px-2.5 py-1 rounded-full transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(26,26,26,0.06)', color: '#1A1A1A' }}>
                                          View Details
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                            );
                          }}
                        </Draggable>
                      );
                    })}
                  </div>
                  {upcomingActivities.length > 0 && (() => {
                    const upcomingTotalPages = Math.ceil(upcomingActivities.length / 5);
                    const upcomingEndIdx = upcomingPage * 5 + visibleUpcomingOnPage;
                    return (
                      <div className="flex justify-center gap-2 pt-4 flex-wrap">
                        {visibleUpcomingOnPage < 5 && upcomingEndIdx < upcomingActivities.length && (
                          <Button variant="outline" onClick={() => setVisibleUpcomingOnPage(v => Math.min(5, v + 5))} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Load More</Button>
                        )}
                        {upcomingTotalPages > 1 && (
                          <>
                            <Button variant="outline" onClick={() => { setUpcomingPage(p => Math.max(0, p - 1)); setVisibleUpcomingOnPage(5); }} disabled={upcomingPage === 0} style={{ borderColor: '#B8956A', color: '#B8956A' }}>← Back</Button>
                            <span className="px-3 py-2 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Page {upcomingPage + 1} of {upcomingTotalPages}</span>
                            <Button variant="outline" onClick={() => { setUpcomingPage(p => Math.min(upcomingTotalPages - 1, p + 1)); setVisibleUpcomingOnPage(5); }} disabled={upcomingPage === upcomingTotalPages - 1} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Next →</Button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {provided.placeholder}
                </div>
                );
              }}
            </Droppable>

            {/* ── ACTIVITY HISTORY ── */}
            <Droppable droppableId="history">
              {(provided, snapshot) => {
                return (
                <div ref={provided.innerRef} {...provided.droppableProps} className="mb-8">
                  <h2 className="text-xl font-semibold mb-1" style={{ color: '#1A1A1A' }}>Activity History</h2>
                  <p className="text-xs mb-4" style={{ color: 'rgba(26,26,26,0.4)' }}>drag to move</p>
                  {snapshot.isDraggingOver && (
                    <div className="rounded-xl border-2 border-dashed flex items-center justify-center h-12 text-sm mb-3 transition-all" style={{ borderColor: '#B8956A', color: 'rgba(26,26,26,0.4)', backgroundColor: 'rgba(184,149,106,0.06)' }}>
                      Drop here to move to history
                    </div>
                  )}
                  <div className="space-y-3">
                    {pastActivities.length === 0 && upcomingActivities.length === 0 ? (
                      <Card>
                        <CardContent className="pt-6 text-center" style={{ color: 'rgba(26,26,26,0.6)' }}>
                          No activities logged yet
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {currentPageActivities.map((activity, index) => (
                          <Draggable key={activity.id} draggableId={activity.id} index={upcomingActivities.length + index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                style={{ ...dragProvided.draggableProps.style, opacity: dragSnapshot.isDragging ? 0.85 : 1 }}
                              >
                                <Card className="cursor-pointer hover:shadow-md transition" style={{ backgroundColor: dragSnapshot.isDragging ? 'rgba(184,149,106,0.08)' : undefined }} onClick={() => handleActivityClick(activity)}>
                                  <CardContent className="pt-6">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                      <div className="flex items-start gap-3 flex-1">
                                        <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                                          {activityIcons[activity.activity_type]}
                                        </div>
                                        <div className="flex-1">
                                          <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                                          <p className="font-medium mt-2 cursor-pointer hover:opacity-70" style={{ color: '#1A1A1A' }} onClick={() => {
                                            const displayPhone = activity.contact_phone || phoneLookup[activity.contact_email] || phoneLookup[activity.contact_name] || '';
                                            setPrefilledContactData({ firstName: activity.contact_name?.split(' ')[0] || '', lastName: activity.contact_name?.split(' ').slice(1).join(' ') || '', email: activity.contact_email || '', phone: displayPhone, company: activity.company_name || '' });
                                            setOpenNewContactForm(true);
                                            setActiveTab("contacts");
                                          }}>{activity.contact_name || activity.company_name}</p>
                                          {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                                          {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.company_name}</p>}
                                          {(() => {
                                            const displayPhone = activity.contact_phone || phoneLookup[activity.contact_email] || phoneLookup[activity.contact_name] || '';
                                            return displayPhone ? (
                                              <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('_dialerPhone', displayPhone); setActiveTab("call"); }} className="flex items-center gap-1 text-xs font-medium mt-0.5 hover:opacity-70 transition-opacity" style={{ color: '#B8956A' }}>
                                                <Phone className="w-3 h-3" />{displayPhone}
                                              </button>
                                            ) : null;
                                          })()}
                                          {(() => {
                                            const raw = (activity.notes || '').replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '');
                                            const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                                            const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                                            return (
                                              <div className="mt-2 flex items-start gap-2 flex-wrap">
                                                {shortNote && <p className="text-sm flex-1" style={{ color: '#1A1A1A' }}>{shortNote.slice(0, 100)}{shortNote.length > 100 ? '...' : ''}</p>}
                                                {hasCallMap && (
                                                  <button onClick={(e) => { e.stopPropagation(); setCallMapActivity(activity); }} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-80" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}>
                                                    📋 View Call Map
                                                  </button>
                                                )}
                                              </div>
                                            );
                                          })()}
                                          {activity.duration_minutes > 0 && (
                                            <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.duration_minutes} minutes</p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-sm md:text-right md:whitespace-nowrap" style={{ color: 'rgba(26,26,26,0.6)' }}>
                                        {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        <div className="flex justify-center gap-2 pt-4 flex-wrap">
                          {visibleOnCurrentPage < itemsPerPage && endIdx < pastActivities.length && (
                            <Button variant="outline" onClick={() => setVisibleOnCurrentPage(v => Math.min(itemsPerPage, v + 5))} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Load More</Button>
                          )}
                          {totalPages > 1 && (
                            <>
                              <Button variant="outline" onClick={() => { setCurrentPage(p => Math.max(0, p - 1)); setVisibleOnCurrentPage(5); }} disabled={currentPage === 0} style={{ borderColor: '#B8956A', color: '#B8956A' }}>← Back</Button>
                              <span className="px-3 py-2 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Page {currentPage + 1} of {totalPages}</span>
                              <Button variant="outline" onClick={() => { setCurrentPage(p => Math.min(totalPages - 1, p + 1)); setVisibleOnCurrentPage(5); }} disabled={currentPage === totalPages - 1} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Next →</Button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                );
              }}
            </Droppable>

            {/* Archive button */}
            <div className="flex justify-center pb-4">
              <Button variant="outline" onClick={() => setShowArchive(true)} className="gap-2" style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}>
                <Archive className="w-4 h-4" />
                View Activity Archive
              </Button>
            </div>
          </div>
          </DragDropContext>
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
               <div className="flex justify-between items-center pr-6">
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
                       {(() => {
                       const raw = (selectedActivity.notes || '').replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '');
                       const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                       const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                       return (
                         <>
                           <p><span className="font-medium">Notes:</span> {shortNote}</p>
                           {hasCallMap && (
                             <button
                               onClick={() => { setSelectedActivity(null); setCallMapActivity(selectedActivity); }}
                               className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full mt-1 transition-opacity hover:opacity-80"
                               style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}
                             >
                               📋 View Call Map
                             </button>
                           )}
                         </>
                       );
                     })()}
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

        {/* Call Map Modal */}
        {callMapActivity && (() => {
          const raw = callMapActivity.notes || '';
          const mapMatch = raw.match(/--- CALL MAP ---\s*([\s\S]*)/i);
          const callMap = mapMatch ? mapMatch[1].trim() : raw;
          const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();

          const handleSaveCallMapEdit = async (editedText) => {
            try {
              const existingShortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').trim();
              const updatedNotes = `${existingShortNote}\n\n--- CALL MAP ---\n${editedText}`;
              await base44.entities.ActivityLog.update(callMapActivity.id, { notes: updatedNotes });
              console.log('[HubSpot] Call map edit saved successfully');
              setCallMapActivity(prev => ({ ...prev, notes: updatedNotes }));
              queryClient.invalidateQueries({ queryKey: ['activities'] });
              // Fire-and-forget: analyze the edit for system-level learning
              base44.functions.invoke('analyzeCallMapEdit', {
                salesMemberId: user?.id,
                salesMemberEmail: user?.email,
                originalCallMap: callMap,
                editedCallMap: editedText
              }).catch(() => {});
              // Return success so the modal knows to close
              return Promise.resolve();
            } catch (error) {
              console.error('[HubSpot] Failed to save call map edit:', error);
              alert('Failed to save call map changes: ' + error.message);
              return Promise.reject(error);
            }
          };

          const handleRegenerate = async (extraContext) => {
              setRegeneratingCallMap(true);
              try {
                // Fetch activity history + SMS + HubSpot data + web search
                const priorActivities = activities
                  .filter(a => a.contact_email === callMapActivity.contact_email && a.id !== callMapActivity.id)
                  .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
                  .slice(0, 10);

                // Extract manual edits from prior activities for LLM learning
                const manualEdits = priorActivities
                  .filter(a => {
                    const raw = a.notes || '';
                    return raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                  })
                  .map(a => {
                    const raw = a.notes || '';
                    const mapMatch = raw.match(/--- CALL MAP ---\s*([\s\S]*)/i);
                    const callMap = mapMatch ? mapMatch[1].trim() : '';
                    return `[Manually edited on ${new Date(a.activity_date).toLocaleDateString()}]\n${callMap.slice(0, 500)}...`;
                  })
                  .join('\n\n');

                const history = priorActivities
                  .map(a => `${a.activity_type} on ${new Date(a.activity_date).toLocaleDateString()}: ${(a.notes || '').slice(0, 300)}`)
                  .join('\n');

                // Collect attachment URLs from previous activities for LLM analysis
                const attachmentUrls = [];
                priorActivities.forEach(a => {
                  if (a.picture_urls && Array.isArray(a.picture_urls) && a.picture_urls.length > 0) {
                    attachmentUrls.push(...a.picture_urls);
                  }
                });
                console.log('Attachment URLs for LLM:', attachmentUrls);

               // Fetch SMS conversation history
               let smsContext = '';
               try {
                 const smsConvos = await base44.entities.SmsConversation.filter({ contact_name: callMapActivity.contact_name });
                 if (smsConvos?.length > 0) {
                   const msgs = await base44.entities.SmsMessage.filter({ conversation_id: smsConvos[0].id }, '-created_date', 20);
                   smsContext = msgs?.map(m => `[${m.direction}] ${m.body}`).join('\n') || '';
                 }
               } catch (e) { console.error('SMS fetch failed:', e); }

               // Fetch HubSpot contact data
               let hubspotContext = '';
               try {
                 const hsRes = await base44.functions.invoke('searchHubSpotContacts', { query: callMapActivity.contact_email || callMapActivity.contact_name });
                 const contact = hsRes.data?.contacts?.[0];
                 if (contact) {
                   hubspotContext = `
          HubSpot Profile:
          - Phone: ${contact.phone || 'N/A'}
          - Company: ${contact.company || 'N/A'}
          - Title: ${contact.job_title || 'N/A'}
          - Last activity: ${contact.lastmodifieddate || 'N/A'}
          - Notes: ${contact.notes || 'N/A'}
          - Recent listings: ${contact.recent_listings || 'N/A'}`;
                 }
               } catch (e) { console.error('HubSpot fetch failed:', e); }

               // Web search for agent/company context
               let webContext = '';
               try {
                 const searchQuery = callMapActivity.company_name && callMapActivity.contact_name 
                   ? `${callMapActivity.contact_name} ${callMapActivity.company_name} real estate agent`
                   : callMapActivity.company_name || callMapActivity.contact_name;
                 const webRes = await base44.integrations.Core.InvokeLLM({
                   prompt: `Search for and summarize key information about: ${searchQuery}. Focus on: years in business, transaction volume, specialties, market position, recent deals, and professional approach. Keep to 200 words max.`,
                   add_context_from_internet: true
                 });
                 webContext = typeof webRes === 'string' ? webRes : webRes?.text || '';
               } catch (e) { console.error('Web search failed:', e); }

               const callCount = activities.filter(a => a.contact_email === callMapActivity.contact_email).length;
               const isWarmContact = callCount >= 5;

               const salesRepName = localStorage.getItem('sales_member_name') || 'the sales rep';
               const prompt = `You are generating a hyper-personalized, research-backed call map for ${salesRepName}, a sales representative for ARRIV Estate Media LLC (full-service real estate media: photography, video, drone).

               ## CURRENT CALL MAP (THE REP HAS MANUALLY EDITED THIS — PRESERVE THEIR WORDING AND STYLE)
               ${callMap ? `The rep has already customized the call map below. Treat every edit as intentional. Preserve their phrasing, structure, and tone. Only update sections that need to change based on new context.\n${callMap}` : 'No existing call map — generate fresh.'}

               ## PRIOR MANUAL EDITS FROM OTHER ACTIVITIES (ALSO LEARN FROM THESE)
               ${manualEdits || 'No prior edits.'}

               ## CONTACT INFO
          - Name: ${callMapActivity.contact_name || 'the contact'}
          - Company: ${callMapActivity.company_name || 'their brokerage'}
          - Email: ${callMapActivity.contact_email || ''}
          - Prior touchpoints with this contact: ${callCount}
          - Warm contact (5+ prior calls): ${isWarmContact ? 'YES — skip "do you have a moment?"' : 'NO — include "do you have a moment?"'}

          ## HUBSPOT DATA
          ${hubspotContext || 'No HubSpot data found'}

          ## BACKGROUND RESEARCH (from web)
          ${webContext || 'No web data found'}

          ## SMS / MESSAGE HISTORY
          ${smsContext || 'No SMS history'}

          ## CONTEXT FROM BRAD
          ${shortNote || 'No prior notes'}

          ## RECENT ACTIVITY HISTORY
          ${history || 'No prior history'}

          ## 🎯 CRITICAL: VISUAL CONTEXT REQUIREMENT
**YOU MUST analyze the attached images and reference them explicitly in the call map.**
**FIRST PRIORITY: If ANY images contain SMS/email/text conversations, extract and read them word-for-word.** This tells you the REAL relationship stage and what's actually being discussed.

Then:
1. Extract any SMS/conversation text visible in screenshots — read it carefully to understand relationship stage, specific projects mentioned, and tone (warm vs cold)
2. Identify what properties/features were shown in photos/videos
3. Note what Brad emphasized visually
4. **Weave specific details from conversations into EVERY section** — not just mention the projects, actually reference the exact context they discussed (e.g., "Following up on that new construction build across the street you mentioned," "like you texted—flexible on turnaround," "the portfolio link I sent")
5. Use visual memory to build rapport with real project context, not generic language

${attachmentUrls.length > 0 ? `\n## IMAGES FROM PREVIOUS INTERACTIONS\nAttached images from calls with ${callMapActivity.contact_name}:\n${attachmentUrls.map((url, i) => `[Image ${i + 1}]: ${url}`).join('\n')}\n\n**ANALYZE THESE IMAGES AND WEAVE THEIR SPECIFIC DETAILS INTO EVERY RELEVANT SECTION OF THE CALL MAP.**` : 'NOTE: No images attached for this contact yet.'}

          ${extraContext ? `## ADDITIONAL INPUT FROM BRAD (REAL-TIME UPDATE)\n${extraContext}` : ''}

---

## CLOSING STRATEGIES (Based on Agent/Market Research)
Use the HubSpot and web research above to tailor your approach:
- **High-volume agents**: Emphasize efficiency ("2–3 min videos, drop-and-go")
- **Boutique/niche agents**: Emphasize premium positioning ("cinematic production for luxury listings")
- **Newer agents**: Emphasize ROI + proof ("video listings sell 30% faster")
- **Relocation specialists**: Emphasize buyer familiarity ("virtual walkthrough reduces showings")
- **Market conditions**: In hot markets, emphasize speed; in slower markets, emphasize closing power

---

## BRAD'S PROVEN SCRIPT STYLE (use this tone and structure + personalization)

**Cold/first call opener:**
"Hi [Name], this is Brad Burke — I'm a local real estate media creator.${isWarmContact ? '' : ' Do you have a moment?'} I came across your [listing/property/recent deal] and [specific observation based on their speciality/market]. I just wanted to see if [video/photography] was something you were considering — especially given [market insight or their transaction volume]."

**Follow-up opener (2nd–3rd calls, keep rapport-building):**
"Hi [Name], this is Brad Burke. Quick question — how are you doing? Do you have a moment?"

**Warm contact opener (5+ calls):**
"Hey [Name], it's Brad — quick call, I won't keep you long. [Specific reason tied to their recent deals or market]."

**If they already have a photographer:**
"Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource — especially for [their specialty market]."

**Close-ready pitch (when they're engaged):**
"Great. So here's what I'm thinking: a [2–3 minute cinematic walkthrough / series of property photos] that we can get you by [specific date]. You can drop it straight into [MLS/listing portal]. What's your schedule looking like this [week/next week]?"

**Value props (pick the most relevant based on their profile):**
- "Clean, MLS-ready videos that help buyers understand layout before showings"
- "A 2–3 minute video you can just drop into the listing"
- "Helps get it to the closing table — video listings typically sell [faster/at higher prices in your market]"
- "Full-service — photography, video, and drone"
- "[For high-volume agents] Bulk pricing for your portfolio"

---

## CRITICAL INSTRUCTIONS FOR THIS CALL MAP

1. **Use all research data above**: Reference their market position, recent deals, specialties, transaction volume, etc.
2. **Tailor the closing strategy**: Match your approach to whether they're high-volume, boutique, newer agent, or specialist.
3. **Personalize every section**: NO generic scripts. Every objection handler and close reference their specific situation.
4. **Reference specifics**: If you have recent listing data, SMS history, or HubSpot notes — weave them in naturally.
5. **Respect touch sequence**: Calls 1–3 always ask "do you have a moment?" and "how are you doing?" Calls 5+ can skip it.
6. **Make it closeable**: Every path should lead to a specific ask — date/time booking, callback, email follow-up, etc.

---

## GENERATE THIS COMPLETE CALL MAP:

### 📞 Opening Line
(word-for-word, use Brad's style — personalized with research from above)
${!isWarmContact ? '(MUST include: "Do you have a moment?" + "How are you doing?")'  : '(Skip "do you have a moment?" — jump straight to reason)'}

---

### 🔀 If Interested / Open
(guide toward booking, reference their specific listings/market, ask about schedule, mention cadence/timeline)

---

### 🔀 If They Already Have Someone
(use the "backup resource" line tailored to their specialty/market — plant a seed, don't push)

---

### 🔀 If Busy / Bad Time
(respect it, lock in a specific callback time — reference their transaction volume/listing pipeline if known)

---

### 🔀 If They Ask About Pricing
(value-first answer tied to their market/agent type, "Brad handles the specifics" — never quote a number)

---

### 🔀 If They Ask About Timeline
(reference how fast Brad works, give realistic turnaround, tie to their listing schedule)

---

### 🔀 If They Ask About Portfolio / Previous Work
(reference specific real estate verticals or market conditions Brad has worked in — specificity wins)

---

### 🔀 If Cold / Not Engaging
(short graceful exit that leaves door open — reference you can help with their future listings/pipeline)

---

### 📵 Voicemail Script
(word-for-word, UNDER 15 seconds when spoken out loud, casual, specific — reference something about their business or market)

---

### 📱 Follow-Up Text
(short text to send immediately after leaving voicemail — conversational, not salesy, reference the reason for the call)

---

### 🏁 Closing / Next Steps
(exact closing line + confirm the next step — email, callback date, or direct booking)

---

Keep every section short and conversational. Brad is calling directly — write it ONLY in his voice, using the research you've gathered.`;

              const result = await base44.integrations.Core.InvokeLLM({ 
                 prompt,
                 ...(attachmentUrls.length > 0 && { file_urls: attachmentUrls })
               });
               const newCallMap = typeof result === 'string' ? result : result?.text || result?.content || '';
              const existingShortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').trim();
              const updatedNotes = `${existingShortNote}\n\n--- CALL MAP ---\n${newCallMap}`;
              await base44.entities.ActivityLog.update(callMapActivity.id, { notes: updatedNotes });
              setCallMapActivity(prev => ({ ...prev, notes: updatedNotes }));
              queryClient.invalidateQueries({ queryKey: ['activities'] });
            } finally {
              setRegeneratingCallMap(false);
            }
          };

          return (
            <CallMapModal
              open={!!callMapActivity}
              onClose={() => setCallMapActivity(null)}
              contactName={callMapActivity.contact_name || callMapActivity.company_name || 'Contact'}
              callMap={callMap}
              onRegenerate={handleRegenerate}
              regenerating={regeneratingCallMap}
              contactPhone={callMapActivity.contact_phone || phoneLookup[callMapActivity.contact_email] || phoneLookup[callMapActivity.contact_name] || ''}
              contactEmail={callMapActivity.contact_email || ''}
              onCall={(phone) => { localStorage.setItem('_dialerPhone', phone); setActiveTab("call"); }}
              onEmail={(email) => { localStorage.setItem('_emailTo', email); setActiveTab("email"); }}
              onSaveEdit={handleSaveCallMapEdit}
            />
          );
        })()}

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