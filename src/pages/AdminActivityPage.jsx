import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Clock, Zap, MessageSquare, Sparkles } from "lucide-react";
import { format } from "date-fns";
import EmailComposer from "@/components/sales/EmailComposer";
import IphoneDialer from "@/components/sales/IphoneDialer";
import ContactSearch from "@/components/sales/ContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import ChatTab from "@/components/sales/ChatTab";
import AdminChatBubble from "@/components/admin/AdminChatBubble";
import CalendarTab from "@/components/sales/CalendarTab";
import AiAssistantTab from "@/components/sales/AiAssistantTab";
import IncomingVideoCallModal from "@/components/sales/IncomingVideoCallModal";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";

export default function AdminActivityPage({ user: propsUser, onVideoCallStateChange }) {
  const [user, setUser] = useState(propsUser);
  const [activeTab, setActiveTab] = useState("activity");
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [minimizedVideoCall, setMinimizedVideoCall] = useState(null);
  const [isVideoWindowOpen, setIsVideoWindowOpen] = useState(false);

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
  const [formData, setFormData] = useState({
    activity_type: "call",
    contact_email: "",
    contact_name: "",
    contact_phone: "",
    company_name: "",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0,
    picture_url: null
  });
  const [pictureFile, setPictureFile] = useState(null);
  const [openNewContactForm, setOpenNewContactForm] = useState(false);
  const [prefilledContactData, setPrefilledContactData] = useState(null);
  const [unreadSmsCount, setUnreadSmsCount] = useState(0);
  const [missedCallsCount, setMissedCallsCount] = useState(0);
  const [incomingVideoCall, setIncomingVideoCall] = useState(null);
  const [activeVideoCall, setActiveVideoCall] = useState(null);
  const [videoCallProcessing, setVideoCallProcessing] = useState(false);




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
        // After switching to call tab and dialer mounts, dispatch initiateTransfer
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('initiateTransfer', {
            detail: { extension: phone, name: '' }
          }));
        }, 400);
      }
    };

    const handleEmailCardReady = () => {
      const email = localStorage.getItem('emailTo');
      if (email) {
        localStorage.setItem('_emailTo', email);
        setActiveTab('email');
        localStorage.removeItem('emailTo');
      }
    };

    window.addEventListener('contactCardReady', handleContactCardReady);
    window.addEventListener('dialerCardReady', handleDialerCardReady);
    window.addEventListener('emailCardReady', handleEmailCardReady);

    return () => {
      window.removeEventListener('contactCardReady', handleContactCardReady);
      window.removeEventListener('dialerCardReady', handleDialerCardReady);
      window.removeEventListener('emailCardReady', handleEmailCardReady);
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
        // Get admin's Twilio number from environment
        const adminTwilioNumber = localStorage.getItem('admin_twilio_number') || Deno?.env.get('TWILIO_CALLING_PHONE_NUMBER');
        if (!adminTwilioNumber) {
          setUnreadSmsCount(0);
          return;
        }
        const convos = await base44.entities.SmsConversation.filter({ from_number: adminTwilioNumber });
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
    const smsSub = base44.entities.SmsConversation.subscribe(loadDialerBadge);
    const callSub = base44.entities.ActivityLog.subscribe((event) => {
      if (event.data?.activity_type === 'call') loadDialerBadge();
    });

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

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .slice(0, 5);

  const pastActivities = activities
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ActivityLog.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
      setShowForm(false);
      setPictureFile(null);
      setFormData({
        activity_type: "call",
        contact_email: "",
        contact_name: "",
        contact_phone: "",
        company_name: "",
        activity_date: new Date().toISOString().slice(0, 16),
        notes: "",
        duration_minutes: 0,
        picture_url: null
      });
    }
  });

  const handleAcceptVideoCall = async () => {
    if (!incomingVideoCall) return;
    console.log('[ADMIN_ACCEPT_CALL] Accepting call:', { notificationId: incomingVideoCall.notificationId, caller: incomingVideoCall.callerName, isVideoWindowOpen: true });
    setVideoCallProcessing(true);
    await base44.entities.PendingNotification.update(incomingVideoCall.notificationId, { is_read: true }).catch(() => {});
    setIsVideoWindowOpen(true);
    setActiveVideoCall(incomingVideoCall);
    setHideChatBubble(true);
    setIncomingVideoCall(null);
    setVideoCallProcessing(false);
    onVideoCallStateChange?.(true);
    console.log('[ADMIN_ACCEPT_CALL] Call accepted, isVideoWindowOpen state set to TRUE');
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

  const handlePictureChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPictureFile(file);
      // Upload to get URL
      try {
        const { data } = await base44.integrations.Core.UploadFile({ file });
        setFormData({ ...formData, picture_url: data.file_url });
      } catch (error) {
        console.error('Picture upload error:', error);
      }
    }
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
                      <label className="block text-sm font-medium mb-1">Activity Type</label>
                      <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Meeting</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Name *</label>
                      <Input
                        placeholder="e.g., John Doe"
                        value={formData.contact_name}
                        onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Phone Number *</label>
                      <Input
                        placeholder="e.g., (555) 123-4567"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Email</label>
                      <Input
                        type="email"
                        placeholder="john@example.com"
                        value={formData.contact_email}
                        onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Company Name</label>
                      <Input
                        placeholder="e.g., Acme Inc"
                        value={formData.company_name}
                        onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                      />
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
                      <label className="block text-sm font-medium mb-1">Add Picture</label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handlePictureChange}
                      />
                      {formData.picture_url && (
                        <img src={formData.picture_url} alt="Activity" className="mt-2 rounded-lg max-h-32 w-auto" />
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
                      disabled={createActivityMutation.isPending}
                      className="w-full"
                    >
                      {createActivityMutation.isPending ? "Logging..." : "Log Activity"}
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
            Send Email
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
            Contacts
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

        {activeTab === "chat" && (
          <ChatTab 
            currentUserId={user?.id} 
            currentUserName={user?.full_name} 
            salesMemberId={user?.id} 
            isAdmin={true}
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

        {activeTab === "activity" && (
          <>
            {upcomingActivities.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
                  <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
                  <Badge variant="secondary">{upcomingActivities.length}</Badge>
                </div>
                <div className="space-y-3">
                  {upcomingActivities.map((activity) => (
                    <Card key={activity.id} style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184, 149, 106, 0.1)' }}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.2)' }}>
                              {activityIcons[activity.activity_type]}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" style={{ backgroundColor: 'rgba(184, 149, 106, 0.2)', color: '#B8956A' }}>{activityLabels[activity.activity_type]}</Badge>
                                <Clock className="w-4 h-4" style={{ color: '#B8956A' }} />
                                <span className="text-sm font-medium" style={{ color: '#B8956A' }}>
                                  {format(new Date(activity.activity_date), "MMM d 'at' h:mm a")}
                                </span>
                              </div>
                              <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                              {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                              {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                              <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                              {activity.picture_url && (
                                <img src={activity.picture_url} alt="Activity" className="mt-2 rounded-lg max-h-32 w-auto" />
                              )}
                            </div>
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
                    <CardContent className="pt-6 text-center" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                      No activities logged yet
                    </CardContent>
                  </Card>
                ) : (
                  pastActivities.map((activity) => (
                    <Card 
                      key={activity.id}
                      className="cursor-pointer hover:shadow-md transition"
                      onClick={() => handleActivityClick(activity)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)' }}>
                              {activityIcons[activity.activity_type]}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                              </div>
                              <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                              {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                              {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                              <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '')}</p>
                              {activity.duration_minutes > 0 && (
                                <p className="text-xs mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.duration_minutes} minutes</p>
                              )}
                              {activity.picture_url && (
                                <img src={activity.picture_url} alt="Activity" className="mt-2 rounded-lg max-h-32 w-auto" />
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                            {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Activity Detail Modal */}
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
                    <p><span className="font-medium">Notes:</span> {selectedActivity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '')}</p>
                    {selectedActivity.duration_minutes > 0 && (
                      <p><span className="font-medium">Duration:</span> {selectedActivity.duration_minutes} minutes</p>
                    )}
                    {selectedActivity.picture_url && (
                      <div>
                        <p className="font-medium mb-2">Picture:</p>
                        <img src={selectedActivity.picture_url} alt="Activity" className="rounded-lg max-h-48 w-auto" />
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
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Test button for incoming video notification (Admin only) */}
        {user?.role === 'admin' && (
          <div className="fixed top-20 left-4 z-[250]">
            <Button 
              onClick={async () => {
                console.log('[ADMIN_TEST] Sending test incoming video notification to Admin:', user?.id);
                try {
                  await base44.entities.PendingNotification.create({
                    recipient_id: user?.id,
                    recipient_email: user?.email,
                    event_type: 'incoming_video_call',
                    is_read: false,
                    event_data: {
                      roomName: 'test-room-' + Date.now(),
                      callerName: 'Test Caller',
                      callerExtension: '999',
                      recipientToken: 'test-token-' + Date.now()
                    }
                  });
                  console.log('[ADMIN_TEST] Test notification created');
                } catch (err) {
                  console.error('[ADMIN_TEST] Failed to create test notification:', err);
                }
              }}
              variant="outline"
              size="sm"
              className="text-xs"
              title="Send a test incoming video call notification"
            >
              🧪 Test Incoming Call
            </Button>
          </div>
        )}

        {/* Incoming video call */}
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
             isIncoming={true}
             autoStart={true}
             onClose={() => {
               setActiveVideoCall(null);
               setIsVideoWindowOpen(false);
               setHideChatBubble(false);
               onVideoCallStateChange?.(false);
             }}
             onMinimize={() => {
               setIsVideoWindowOpen(false);
               setHideChatBubble(false);
             }}
             isVideoWindowOpen={isVideoWindowOpen}
             onChatOpenRequest={() => {}}
           />
         )}

        {/* Chat bubble - hidden during active video call */}
        {!activeVideoCall && (
          <AdminChatBubble
            currentUserId={user?.id} 
            currentUserName={user?.full_name}
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

        {/* Minimized video call indicator */}
        {activeVideoCall && !isVideoWindowOpen && (
         <div className="fixed bottom-4 left-4 z-[99998] flex flex-col gap-2">
            <button
              onClick={() => setIsVideoWindowOpen(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg transition-colors"
              title="Restore video call"
            >
              📞 Return to Call
            </button>
            <button
              onClick={() => {
                setActiveVideoCall(null);
                setIsVideoWindowOpen(false);
              }}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg transition-colors"
              title="End call"
            >
              ✕ End Call
            </button>
          </div>
        )}


        </div>
        </div>
        );
        }