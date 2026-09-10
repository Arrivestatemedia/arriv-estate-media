import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Clock, Zap, MessageSquare, Sparkles, Archive, ChevronDown, ChevronUp, Navigation } from "lucide-react";
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
import ActivityArchive from "@/components/sales/ActivityArchive";
import DailyCallQueue from "@/components/sales/DailyCallQueue";
import CallMapModal from "@/components/sales/CallMapModal";

export default function AdminActivityPage({ user: propsUser, initialSubTab, onVideoCallStateChange, onVideoCallStarted, onVideoCallEnded }) {
  const location = useLocation();
  const [user, setUser] = useState(propsUser);
  const [activeTab, setActiveTab] = useState(initialSubTab || "activity");
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);

  // Load user from localStorage if not provided
  useEffect(() => {
    if (propsUser) {
      setUser(propsUser);
    } else {
      const salesMemberId = localStorage.getItem('sales_member_id');
      if (salesMemberId) {
        base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
          if (members?.[0]) {
            setUser({
              id: members[0].id,
              email: members[0].email,
              full_name: members[0].full_name,
              role: members[0].role
            });
          }
        }).catch(() => {});
      }
    }
  }, [propsUser]);

  // Read tab from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const dialerParam = params.get('dialer');
    
    if (dialerParam === 'true') {
      // Directly switch to dialer tab with phone pre-filled
      const phone = localStorage.getItem('_dialerPhone');
      setActiveTab('call');
      // If no phone yet, set sessionStorage flag to pick it up from listener
      if (!phone) {
        sessionStorage.setItem('_switchToDialerTab', 'true');
      }
    } else if (tabParam === 'queue') {
      setActiveTab('activity');
      // Use sessionStorage as a flag to switch to queue sub-tab after tab changes
      sessionStorage.setItem('_switchToQueueSubTab', 'true');
    }
  }, [location.search]);

  // Load contacts when modal opens
  React.useEffect(() => {
    if (!showForm || !user?.email) return;
    setLoadingContacts(true);
    base44.entities.ActivityLog.filter({ sales_member_email: user.email }, '-activity_date', 100)
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
  }, [showForm, user?.email]);

  const [formData, setFormData] = useState({
    activity_type: "call",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0,
    picture_urls: []
  });
  const [pictureFile, setPictureFile] = useState(null);
  const [openNewContactForm, setOpenNewContactForm] = useState(false);
  const [prefilledContactData, setPrefilledContactData] = useState(null);
  const [unreadSmsCount, setUnreadSmsCount] = useState(0);
  const [missedCallsCount, setMissedCallsCount] = useState(0);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editFormData, setEditFormData] = useState(null);





  // ============================================================
  // ⚠️  DO NOT MODIFY THIS useEffect BLOCK ⚠️
  // Listens for contact card click events dispatched by AdminHub:
  //   - 'contactCardReady' → reads 'newContactData' from localStorage → opens Contacts tab pre-filled
  //   - 'dialerCardReady'  → reads 'dialerPhone' from localStorage   → opens Dialer Keypad pre-filled
  //   - 'emailCardReady'   → reads 'emailTo' from localStorage       → opens Send Email To field pre-filled
  // Removing or changing this will break contact card navigation for admin sales reps.
  // ============================================================
  useEffect(() => {
    const handleContactCardReady = () => {
      const contactData = localStorage.getItem('newContactData');
      if (contactData) {
        const contact = JSON.parse(contactData);
        setPrefilledContactData(contact);
        setActiveTab('contacts');
        // Delay form opening to allow tab to switch first
        setTimeout(() => {
          setOpenNewContactForm(true);
        }, 50);
        localStorage.removeItem('newContactData');
      }
    };

    const handleDialerCardReady = () => {
      const phone = localStorage.getItem('dialerPhone');
      if (phone) {
        setActiveTab('call');
        localStorage.removeItem('dialerPhone');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('initiateTransfer', {
            detail: { extension: phone, name: '' }
          }));
        }, 400);
      }
    };

    // Handle openDialer event from LeadCard phone number clicks
    const handleOpenDialer = (event) => {
      const { phone } = event.detail;
      if (phone) localStorage.setItem('_dialerPhone', phone);
      setActiveTab('call');
    };

    // Handle showDialer event from ContactDetailPage (non-navigation)
    const handleShowDialer = (event) => {
      const { phone } = event.detail;
      if (phone) localStorage.setItem('_dialerPhone', phone);
      setActiveTab('call');
    };

    const handleEmailCardReady = () => {
      const email = localStorage.getItem('emailTo');
      if (email) {
        localStorage.setItem('_emailTo', email);
        setActiveTab('email');
        localStorage.removeItem('emailTo');
      }
    };

    const handleSwitchToQueue = () => setActiveTab("queue");

    const handleAdminNavigateToQueue = () => {
      setActiveTab("queue");
    };

    window.addEventListener('contactCardReady', handleContactCardReady);
    window.addEventListener('dialerCardReady', handleDialerCardReady);
    window.addEventListener('emailCardReady', handleEmailCardReady);
    window.addEventListener('switchToQueueTab', handleSwitchToQueue);
    window.addEventListener('openDialer', handleOpenDialer);
    window.addEventListener('showDialer', handleShowDialer);
    window.addEventListener('adminNavigateToQueue', handleAdminNavigateToQueue);

    // Check if NotificationPanel stored a pending tab switch
    const pending = sessionStorage.getItem('_pendingTabSwitch');
    if (pending === 'queue') {
      sessionStorage.removeItem('_pendingTabSwitch');
      setActiveTab('queue');
    }

    // Check if we need to switch to queue sub-tab (from URL param tab=queue)
    const switchToQueue = sessionStorage.getItem('_switchToQueueSubTab');
    if (switchToQueue) {
      sessionStorage.removeItem('_switchToQueueSubTab');
      setTimeout(() => {
        setActiveTab('queue');
      }, 50);
    }

    // Check if we need to switch to dialer tab (from dialer=true param)
    const switchToDialer = sessionStorage.getItem('_switchToDialerTab');
    if (switchToDialer) {
      sessionStorage.removeItem('_switchToDialerTab');
      setTimeout(() => {
        setActiveTab('call');
      }, 50);
    }

    return () => {
      window.removeEventListener('contactCardReady', handleContactCardReady);
      window.removeEventListener('dialerCardReady', handleDialerCardReady);
      window.removeEventListener('emailCardReady', handleEmailCardReady);
      window.removeEventListener('switchToQueueTab', handleSwitchToQueue);
      window.removeEventListener('openDialer', handleOpenDialer);
      window.removeEventListener('showDialer', handleShowDialer);
      window.removeEventListener('adminNavigateToQueue', handleAdminNavigateToQueue);
    };
  }, []);

  const queryClient = useQueryClient();

  // Sync chat status with calendar every 3 minutes (same as AdminHub)
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

  // Count unread SMS conversations + unacknowledged missed calls for the dialer badge
  useEffect(() => {
    if (!user?.email) return;
    const loadDialerBadge = async () => {
      try {
        const convos = await base44.entities.SmsConversation.list();
        const total = convos?.reduce((sum, c) => sum + (c.unread_count || 0), 0) || 0;
        setUnreadSmsCount(total);
      } catch (err) {
        console.error('Failed to load SMS count:', err);
      }
      try {
        base44.entities.ActivityLog.filter({ activity_type: 'call', missed: true, missed_acknowledged: false, sales_member_email: user.email }).then(logs => {
          setMissedCallsCount(logs?.length || 0);
        }).catch(() => {});
      } catch (err) {
        console.error('Failed to load missed calls:', err);
      }
    };
    loadDialerBadge();
    let smsSub = () => {};
    let callSub = () => {};
    try {
      smsSub = base44.entities.SmsConversation.subscribe(loadDialerBadge);
      callSub = base44.entities.ActivityLog.subscribe((event) => {
        if (event.data?.activity_type === 'call') loadDialerBadge();
      });
    } catch (e) {
      console.error('[AdminActivityPage] subscribe failed:', e);
    }

    return () => { smsSub(); callSub(); };
  }, [user?.email]);

  // Video calls are now handled at the AdminHub level (works across all tabs)

  const { data: activities = [] } = useQuery({
    queryKey: ['adminActivities', user?.email],
    queryFn: async () => {
      const allActivities = await base44.entities.ActivityLog.list('-activity_date', 200);
      return allActivities.filter(a => a.sales_member_email === user?.email);
    },
    initialData: [],
    enabled: !!user,
  });

  // Build phone lookup from all activities + HubSpot enrichment
  const [phoneLookup, setPhoneLookup] = React.useState({});

  React.useEffect(() => {
    const buildLookup = async () => {
      const lookup = {};
      
      // First pass: collect from existing activity records
      activities.forEach(a => {
        if (a.contact_email && a.contact_phone && !lookup[a.contact_email]) {
          lookup[a.contact_email] = a.contact_phone;
        }
        if (a.contact_name && a.contact_phone && !lookup[a.contact_name]) {
          lookup[a.contact_name] = a.contact_phone;
        }
      });

      // Second pass: enrich missing phones from HubSpot
      const missingPhoneEmails = activities
        .filter(a => a.contact_email && !lookup[a.contact_email])
        .map(a => a.contact_email)
        .filter((v, i, a) => a.indexOf(v) === i); // dedupe

      for (const email of missingPhoneEmails) {
        try {
          const res = await base44.functions.invoke('searchHubSpotContacts', { query: email });
          if (res.data?.contacts?.[0]?.phone) {
            lookup[email] = res.data.contacts[0].phone;
          }
        } catch (err) {
          // Silent fail — contact just won't have phone
        }
      }

      setPhoneLookup(lookup);
    };

    buildLookup();
  }, [activities]);

  // Compute which AI-scheduled records have been superseded by a real logged activity
  const resolvedAIIds = useMemo(() => {
    const resolved = new Set();
    const byContact = {};
    activities.forEach(a => {
      const key = a.contact_email || a.contact_name;
      if (!key) return;
      if (!byContact[key]) byContact[key] = [];
      byContact[key].push(a);
    });
    Object.values(byContact).forEach(list => {
      const aiItems = list.filter(a => {
        const n = a.notes || '';
        return n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
      });
      
      // Real items = anything without [AI Scheduled] prefix
      const realItems = list.filter(a => {
        const n = a.notes || '';
        return !n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
      });
      
      // Resolve AI items if ANY real activity exists on or after their scheduled date
      aiItems.forEach(ai => {
        const aiDay = new Date(ai.activity_date);
        aiDay.setHours(0, 0, 0, 0);
        if (realItems.some(r => {
          const rDay = new Date(r.activity_date);
          return rDay >= aiDay;
        })) {
          resolved.add(ai.id);
        }
      });
    });
    return resolved;
  }, [activities]);

  const isAIPending = (a) => {
    const notes = a.notes || '';
    if (notes.includes('[Queue Call]')) return false;
    if (resolvedAIIds.has(a.id)) return false;
    // ONLY treat as pending if it has the [AI Scheduled] prefix
    return notes.includes('[AI Scheduled]');
  };

  const [expandedUpcoming, setExpandedUpcoming] = useState({});
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [visibleUpcomingOnPage, setVisibleUpcomingOnPage] = useState(5);

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date() || isAIPending(a))
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .map(a => {
      const phone = a.contact_phone || phoneLookup[a.contact_email] || phoneLookup[a.contact_name] || '';
      return { ...a, contact_phone: phone };
    });

  const pastActivities = [...activities]
    .filter(a => !isAIPending(a) && new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.created_date || b.activity_date) - new Date(a.created_date || a.activity_date))
    .map(a => {
      const phone = a.contact_phone || phoneLookup[a.contact_email] || phoneLookup[a.contact_name] || '';
      return { ...a, contact_phone: phone };
    });

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      // 1. Create the real activity
      const created = await base44.entities.ActivityLog.create(data);

      // 2. Retire any old AI-scheduled tasks for this contact so they move to history
      if (data.contact_email || data.contact_name) {
        const allLogs = await base44.entities.ActivityLog.list('-activity_date', 300);
        const aiTasksToRetire = allLogs.filter(a => {
          const keyMatch = (data.contact_email && a.contact_email === data.contact_email) ||
            (data.contact_name && a.contact_name === data.contact_name);
          if (!keyMatch) return false;
          const n = a.notes || '';
          return n.includes('[AI Scheduled]') && !n.includes('[Queue Call]');
        });

        if (aiTasksToRetire.length > 0) {
          const retiredDate = new Date();
          retiredDate.setDate(retiredDate.getDate() - 30);
          await Promise.all(aiTasksToRetire.map(s =>
            base44.entities.ActivityLog.update(s.id, {
              activity_date: retiredDate.toISOString(),
              notes: `[Queue Call] Completed via activity log — ${(data.notes || '').slice(0, 100)}`,
            }).catch(() => {})
          ));
        }
      }

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
      setShowForm(false);
      setShowSuccessDialog(true);
      setSelectedContact(null);
      setFormData({
        activity_type: "call",
        activity_date: new Date().toISOString().slice(0, 16),
        notes: "",
        duration_minutes: 0,
        picture_urls: []
      });
    }
  });

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

  const [uploadingPictures, setUploadingPictures] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [callMapActivity, setCallMapActivity] = useState(null);
  const [regeneratingCallMap, setRegeneratingCallMap] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleOnCurrentPage, setVisibleOnCurrentPage] = useState(5);
  const [showArchive, setShowArchive] = useState(false);

  const itemsPerPage = 10;
  const startIdx = currentPage * itemsPerPage;
  const endIdx = startIdx + visibleOnCurrentPage;
  const currentPageActivities = pastActivities.slice(startIdx, endIdx);
  const totalPages = Math.ceil(pastActivities.length / itemsPerPage);

  const handlePictureChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingPictures(true);
    try {
      for (const file of files) {
        const result = await base44.integrations.Core.UploadFile({ file });
        const url = result?.file_url || result?.data?.file_url;
        if (url) {
          setFormData(prev => ({
            ...prev,
            picture_urls: [...(prev.picture_urls || []), url]
          }));
        }
      }
    } catch (error) {
      console.error('Picture upload error:', error);
    } finally {
      setUploadingPictures(false);
    }
  };

  const selectedContactObj = selectedContact
    ? contacts.find(c => (c.email && c.email === selectedContact) || (c.name && c.name === selectedContact))
    : null;

  const handleSubmit = () => {
    if (!formData.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    createActivityMutation.mutate({
      ...formData,
      contact_name: selectedContactObj?.name || "",
      contact_email: selectedContactObj?.email || "",
      contact_phone: selectedContactObj?.phone || "",
      company_name: selectedContactObj?.company || "",
      sales_member_email: user?.email,
      sales_member_id: user?.id
    });
  };

  const handleActivityClick = async (activity) => {
    setSelectedActivity(activity);
  };

  const handleDeleteActivity = async (activity) => {
    if (window.confirm("Are you sure you want to delete this activity?")) {
      try {
        await base44.entities.ActivityLog.delete(activity.id);
        queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
        setSelectedActivity(null);
      } catch (error) {
        alert("Failed to delete activity: " + error.message);
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
      queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
      setSelectedActivity(editFormData);
      setEditingActivity(null);
      setEditFormData(null);
    } catch (error) {
      alert("Failed to save activity: " + error.message);
    }
  };

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;
    const activity = activities.find(a => a.id === draggableId);
    if (!activity) return;

    if (destination.droppableId === 'history') {
      const newDate = new Date(Date.now() - 60000).toISOString();
      base44.entities.ActivityLog.update(activity.id, { activity_date: newDate })
        .then(() => queryClient.invalidateQueries({ queryKey: ['adminActivities'] }));
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 1);
      const yr = tomorrow.getUTCFullYear();
      const isDST = tomorrow >= new Date(Date.UTC(yr, 2, 8)) && tomorrow < new Date(Date.UTC(yr, 10, 1));
      tomorrow.setUTCHours(10 + (isDST ? 4 : 5), 0, 0, 0);
      const optimisticDate = tomorrow.toISOString();

      base44.entities.ActivityLog.update(activity.id, { activity_date: optimisticDate })
        .then(() => queryClient.invalidateQueries({ queryKey: ['adminActivities'] }));

      const contactKey = activity.contact_email || activity.contact_name;
      const contactHistory = activities
        .filter(a => (a.contact_email && a.contact_email === contactKey) || (a.contact_name && a.contact_name === contactKey))
        .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
        .slice(0, 20)
        .map(a => {
          const dt = new Date(a.activity_date);
          const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          const note = (a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim().slice(0, 200);
          return etStr + ' [' + a.activity_type + ']: ' + note;
        }).join('\n');
      const todayET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

      const prompt = 'You are a sales scheduling AI. Analyze this contact\'s full history and pick the BEST specific date+time (ET) to schedule a follow-up call.\n\nTODAY (ET): ' + todayET + '\nCONTACT: ' + (activity.contact_name || activity.contact_email) + '\nFULL ACTIVITY HISTORY (most recent first):\n' + (contactHistory || 'No history.') + '\n\nMust be tomorrow or later, Monday\u2013Friday, between 8am\u20136pm ET. Return ONLY valid JSON:\n{"iso_date": "YYYY-MM-DDTHH:mm:00", "reason": "brief reason"}';

      base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: { type: 'object', properties: { iso_date: { type: 'string' }, reason: { type: 'string' } }, required: ['iso_date', 'reason'] }
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
      }).then(() => queryClient.invalidateQueries({ queryKey: ['adminActivities'] })).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">


        <div className="flex justify-between items-center mb-8">
           <div>
             <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>
               <span style={{ fontStyle: 'italic' }}>My</span> <span style={{ fontStyle: 'italic', fontWeight: 'bold', color: '#3B82F6' }}>Activity</span>
             </h1>
             <p className="mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Manage your sales activities</p>
           </div>
          <div className="flex gap-2 items-center">
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
                         <SelectTrigger>
                           <SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select or create contact"} />
                         </SelectTrigger>
                         <SelectContent>
                          {contacts.map((c) => (
                            <SelectItem key={c.email || c.name} value={c.email || c.name}>
                              {c.name} {c.company ? `(${c.company})` : ""}
                            </SelectItem>
                          ))}
                         </SelectContent>
                       </Select>
                     </div>

                     <div>
                       <label className="block text-sm font-medium mb-1">Activity Type</label>
                      <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
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
                        value={formData.activity_date}
                        onChange={(e) => setFormData({...formData, activity_date: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={formData.duration_minutes}
                        onChange={(e) => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 0})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Add Pictures</label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePictureChange}
                      />
                      {formData.picture_urls?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {formData.picture_urls.map((url, i) => (
                            <img key={i} src={url} alt="Activity" className="rounded-lg max-h-32 w-auto" />
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <Textarea
                        placeholder="Summary of the activity..."
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        rows={4}
                      />
                    </div>

                    <Button
                      onClick={handleSubmit}
                      disabled={createActivityMutation.isPending || uploadingPictures}
                      className="w-full"
                    >
                      {uploadingPictures ? "Uploading pictures..." : createActivityMutation.isPending ? "Logging..." : "Log Activity"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-[#B8956A]/20 overflow-x-auto">
          <button
            onClick={() => setActiveTab("activity")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "activity" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "activity" ? '#B8956A' : 'transparent'
            }}
          >
            Activity Log
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "email" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "email" ? '#B8956A' : 'transparent'
            }}
          >
            Email Hub
          </button>
          <button
            onClick={() => setActiveTab("call")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "call" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "call" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              Dialer
              {(unreadSmsCount > 0 || missedCallsCount > 0) && (
                <Badge variant="destructive" className="ml-1 text-xs">{unreadSmsCount + missedCallsCount}</Badge>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "contacts" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "contacts" ? '#B8956A' : 'transparent'
            }}
          >
            Search/Add Contacts
          </button>
          <button
            onClick={() => setActiveTab("mycontacts")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "mycontacts" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "mycontacts" ? '#B8956A' : 'transparent'
            }}
          >
            My Contacts
          </button>
          <button
            onClick={() => setActiveTab("queue")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "queue" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "queue" ? '#B8956A' : 'transparent'
            }}
          >
            Call Queue
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "chat" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "chat" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" />Chat</span>
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "calendar" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "calendar" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />Calendar</span>
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "ai" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "ai" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" />AI Assistant</span>
          </button>
          <button
            onClick={() => setActiveTab("prospect")}
            className="px-4 py-3 font-medium border-b-2 transition whitespace-nowrap"
            style={{
              color: activeTab === "prospect" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "prospect" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1"><Navigation className="w-4 h-4" />Prospecting</span>
          </button>
        </div>

        {activeTab === "email" && (
          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
            <CardContent className="pt-6">
              <EmailComposer salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "call" && (
          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20', height: '600px' }}>
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
           <DailyCallQueue
             salesMemberId={user?.id}
             salesMemberEmail={user?.email}
             repName={user?.full_name}
           />
         )}

         {activeTab === "chat" && (
          <ChatTab 
            currentUserId={user?.id} 
            currentUserName={user?.full_name} 
            salesMemberId={user?.id} 
            isAdmin={true}
            onVideoCallStarted={onVideoCallStarted}
            onVideoCallEnded={onVideoCallEnded}
            onInitiateTransfer={(memberId, memberName) => {
              base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
                const ext = members?.[0]?.extension;
                if (ext) {
                  setActiveTab("call");
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('initiateTransfer', {
                      detail: { extension: String(ext), name: memberName || members[0]?.full_name }
                    }));
                  }, 400);
                }
              }).catch(() => {});
            }}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarTab salesMemberId={user?.id} />
        )}

        {activeTab === "ai" && (
          <AiAssistantTab repName={user?.full_name} />
        )}

        <div className={activeTab === "prospect" ? "" : "hidden"}>
          <ProspectingTab salesMemberId={user?.id} active={activeTab === "prospect"} />
        </div>

        {activeTab === "activity" && showArchive && (
          <ActivityArchive
            salesMemberId={user?.id}
            salesMemberEmail={user?.email}
            onClose={() => setShowArchive(false)}
          />
        )}

        {activeTab === "activity" && !showArchive && (
          <DragDropContext onDragEnd={handleDragEnd}>
          <>
            <Droppable droppableId="upcoming">
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
                    <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
                    <Badge variant="secondary">{upcomingActivities.length}</Badge>
                    <span className="text-xs ml-1" style={{ color: 'rgba(26,26,26,0.4)' }}>drag to move</span>
                  </div>
                  {upcomingActivities.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed flex items-center justify-center h-16 text-sm transition-all"
                      style={{ borderColor: snapshot.isDraggingOver ? '#B8956A' : 'rgba(184,149,106,0.3)', color: 'rgba(26,26,26,0.4)', backgroundColor: snapshot.isDraggingOver ? 'rgba(184,149,106,0.06)' : 'transparent' }}>
                      Drop here to reschedule as upcoming
                    </div>
                  )}
                  <div className="space-y-3">
                    {upcomingActivities.slice(upcomingPage * 5, upcomingPage * 5 + visibleUpcomingOnPage).map((activity, index) => {
                      const isExpanded = expandedUpcoming[activity.id];
                      const raw = activity.notes || '';
                      const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                      const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                      return (
                      <Draggable key={activity.id} draggableId={activity.id} index={upcomingPage * 5 + index}>
                         {(dragProvided, dragSnapshot) => (
                           <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                             style={{ ...dragProvided.draggableProps.style, opacity: dragSnapshot.isDragging ? 0.85 : 1 }}>
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
                                     {activity.contact_phone ? (
                                       <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('_dialerPhone', activity.contact_phone); setActiveTab("call"); }} className="flex items-center gap-1 text-xs font-medium mb-2 hover:opacity-70 transition-opacity" style={{ color: '#B8956A' }}>
                                         <Phone className="w-3 h-3" /><span>{activity.contact_phone}</span>
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
                         )}
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
              )}
            </Droppable>

            <Droppable droppableId="history">
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="mb-8">
                  <h2 className="text-xl font-semibold mb-1" style={{ color: '#1A1A1A' }}>Activity History</h2>
                  <p className="text-xs mb-4" style={{ color: 'rgba(26,26,26,0.4)' }}>drag to move</p>
                  {snapshot.isDraggingOver && (
                    <div className="rounded-xl border-2 border-dashed flex items-center justify-center h-12 text-sm mb-3 transition-all"
                      style={{ borderColor: '#B8956A', color: 'rgba(26,26,26,0.4)', backgroundColor: 'rgba(184,149,106,0.06)' }}>
                      Drop here to move to history
                    </div>
                  )}
                  <div className="space-y-3">
                {pastActivities.length === 0 && upcomingActivities.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                      No activities logged yet
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {currentPageActivities.map((activity, index) => (
                      <Draggable key={activity.id} draggableId={activity.id} index={upcomingActivities.length + index}>
                        {(dragProvided, dragSnapshot) => (
                          <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                            style={{ ...dragProvided.draggableProps.style, opacity: dragSnapshot.isDragging ? 0.85 : 1 }}>
                      <Card
                        className="cursor-pointer hover:shadow-md transition"
                        style={{ backgroundColor: dragSnapshot.isDragging ? 'rgba(184,149,106,0.08)' : undefined }}
                        onClick={() => handleActivityClick(activity)}
                      >
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)' }}>
                                {activityIcons[activity.activity_type]}
                              </div>
                              <div className="flex-1">
                                <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                                <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                                {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                                {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                                {activity.contact_phone && (
                                  <button onClick={(e) => { e.stopPropagation(); localStorage.setItem('_dialerPhone', activity.contact_phone); setActiveTab("call"); }} className="flex items-center gap-1 text-xs font-medium mt-0.5 hover:opacity-70 transition-opacity" style={{ color: '#B8956A' }}>
                                    <Phone className="w-3 h-3" />{activity.contact_phone}
                                  </button>
                                )}
                                {(() => {
                                  const raw = (activity.notes || '').replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '');
                                  const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                                  const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                                  return (
                                    <div className="mt-2 flex items-start gap-2 flex-wrap">
                                      {shortNote && <p className="text-sm flex-1" style={{ color: '#1A1A1A' }}>{shortNote.slice(0, 100)}{shortNote.length > 100 ? '...' : ''}</p>}
                                      {hasCallMap && (
                                        <button onClick={(e) => { e.stopPropagation(); setCallMapActivity(activity); }}
                                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-80"
                                          style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}>
                                          📋 View Call Map
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                                {activity.duration_minutes > 0 && (
                                  <p className="text-xs mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.duration_minutes} minutes</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right text-sm whitespace-nowrap" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                              {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                          </div>
                        )}
                      </Draggable>
                    ))}
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
                  {provided.placeholder}
                </div>
              )}
            </Droppable>

            {/* Archive button */}
            <div className="flex justify-center pb-4">
              <Button variant="outline" onClick={() => setShowArchive(true)} className="gap-2" style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}>
                <Archive className="w-4 h-4" />
                View Activity Archive
              </Button>
            </div>
          </>
          </DragDropContext>
        )}

        {/* Activity Success Dialog */}
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

        {/* Activity Detail Modal */}
         <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open && !zoomedImage) { setSelectedActivity(null); setEditingActivity(null); } }}>
           <DialogContent className="max-w-2xl">
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
                       const raw = (selectedActivity.notes || '').replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '');
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
                     {selectedActivity.contact_phone && (
                       <Button 
                         size="sm" 
                         className="gap-2"
                         style={{ backgroundColor: '#B8956A', color: '#fff' }}
                         onClick={() => {
                           setActiveTab("call");
                           localStorage.setItem('_dialerPhone', selectedActivity.contact_phone);
                           setSelectedActivity(null);
                         }}
                       >
                         <Phone className="w-4 h-4" />
                         Call
                       </Button>
                     )}
                     {selectedActivity.contact_email && (
                       <Button 
                         size="sm" 
                         className="gap-2"
                         variant="outline"
                         onClick={() => {
                           setActiveTab("email");
                           localStorage.setItem('_emailTo', selectedActivity.contact_email);
                           setSelectedActivity(null);
                         }}
                       >
                         <Mail className="w-4 h-4" />
                         Email
                       </Button>
                     )}
                     <Button 
                       size="sm" 
                       className="gap-2"
                       variant="outline"
                       onClick={() => {
                         setActiveTab("contacts");
                         setPrefilledContactData({
                           firstName: selectedActivity.contact_name?.split(' ')[0] || '',
                           lastName: selectedActivity.contact_name?.split(' ').slice(1).join(' ') || '',
                           email: selectedActivity.contact_email || '',
                           phone: selectedActivity.contact_phone || '',
                           company: selectedActivity.company_name || ''
                         });
                         setTimeout(() => setOpenNewContactForm(true), 50);
                         setSelectedActivity(null);
                       }}
                     >
                       <Plus className="w-4 h-4" />
                       Add Contact Info
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
              console.log('[AdminActivity] Call map edit saved successfully');

              // Trigger style learning from this edit
              try {
                await base44.functions.invoke('analyzeCallMapEdit', {
                  salesMemberId: user?.id,
                  salesMemberEmail: user?.email,
                  originalCallMap: callMap,
                  editedCallMap: editedText
                });
                console.log('[AdminActivity] Style learning triggered');
              } catch (e) {
                console.warn('[AdminActivity] Style learning failed (non-critical):', e);
              }

              setCallMapActivity(prev => ({ ...prev, notes: updatedNotes }));
              queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
              return Promise.resolve();
            } catch (error) {
              console.error('[AdminActivity] Failed to save call map edit:', error);
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

              // Detect first contact and box sent for script injection
              const contactActivities = activities.filter(a => a.contact_email === callMapActivity.contact_email || a.contact_name === callMapActivity.contact_name);
              const allContactNotes = contactActivities.map(a => a.notes || "").join(" ");
              const isFirstContact = contactActivities.length === 0 || contactActivities.every(a => /^(FIRST CONTACT:|Contact created:)/i.test((a.notes || "").trim()));
              const boxSent = /box sent|intro package sent|package sent|sent a box|sent an intro|introduction package|sent box|mailed a box|mailed package/i.test(allContactNotes);
              const fcFirstName = (callMapActivity.contact_name || "").split(" ")[0] || "there";

              const firstContactScript = isFirstContact && !boxSent ? `
⚠️ THIS IS A BRAND NEW CONTACT — FIRST CALL EVER. Use this exact opening structure:
Opening: "Hi ${fcFirstName}, this is Brad — I'm a local real estate media creator. Do you have a moment?"
[Pause briefly]
Then: "I came across your listing on [find their active listing from market research — street name or area] — it's a beautiful home."
[Pause]
Then: "I noticed the listing currently has photos but no video, so I wanted to reach out. I create clean, unbranded video tours that are MLS-ready, so agents can drop them straight into the listing without changing anything else."
[Pause]
Then: "If video isn't something you're planning to add, totally fine — I just wanted to see if it's something you'd be open to considering."
If they have NO active listing found: Skip the listing reference. Instead: "I work with realtors in the area providing full-service real estate media — photography, video, and drone. I just wanted to introduce myself and see if you'd be open to connecting."
` : "";

              const boxContext = boxSent ? `
⚠️ BOX / INTRO PACKAGE WAS SENT TO THIS CONTACT. Opening MUST be:
"Hi ${fcFirstName}, my name is Brad Burke, a local real estate media provider — do you have a moment? I recently sent over a small introduction package and just wanted to introduce myself personally."
[Pause. Let them respond.]
Then: "Glad it made it. I provide full-service real estate media — photography, video, and drone — and I just wanted to put a voice behind the name. [Reference their active listing if found.] I would love to help you get it to the closing table by adding a 2–3 minute MLS-ready video you can just drop into the listing."
If they don't need it: "Totally understand. If you ever need backup coverage or something with a quick turnaround, I'd be happy to be a resource."
` : "";

              // Fetch the sales rep's learned style profile
              let learnedStyleContext = '';
              try {
                const styleProfiles = await base44.asServiceRole.entities.SalesRepStyleProfile.filter({ sales_member_id: user?.id });
                if (styleProfiles?.[0]?.learned_preferences) {
                  learnedStyleContext = `\n\n## LEARNED STYLE FROM BRAD'S EDITS\n${styleProfiles[0].learned_preferences}`;
                }
              } catch (e) {
                console.warn('Failed to fetch style profile (non-critical):', e);
              }

              const salesRepName = localStorage.getItem('sales_member_name') || 'the sales rep';
              const prompt = `You are generating a hyper-personalized, research-backed call map for ${salesRepName}, a sales representative for ARRIV Estate Media LLC (full-service real estate media: photography, video, drone).

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

          ${firstContactScript}${boxContext}
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

          ${learnedStyleContext}

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
          "Hi [Name], this is ${salesRepName} — I'm a local real estate media creator.${isWarmContact ? '' : ' Do you have a moment?'} I came across your [listing/property/recent deal] and [specific observation based on their speciality/market]. I just wanted to see if [video/photography] was something you were considering — especially given [market insight or their transaction volume]."

          **Follow-up opener (2nd–3rd calls, keep rapport-building):**
          "Hi [Name], this is ${salesRepName}. Quick question — how are you doing? Do you have a moment?"

          **Warm contact opener (5+ calls):**
          "Hey [Name], it's ${salesRepName} — quick call, I won't keep you long. [Specific reason tied to their recent deals or market]."

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
              queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
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
              contactPhone={callMapActivity.contact_phone || ''}
              contactEmail={callMapActivity.contact_email || ''}
              onCall={(phone) => { localStorage.setItem('_dialerPhone', phone); setActiveTab("call"); }}
              onEmail={(email) => { localStorage.setItem('_emailTo', email); setActiveTab("email"); }}
              onSaveEdit={handleSaveCallMapEdit}
              />
          );
        })()}

        </div>
        </div>
        );
        }