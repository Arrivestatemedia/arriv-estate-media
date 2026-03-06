import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Clock, Zap, MessageSquare, Sparkles, Archive } from "lucide-react";
import { format } from "date-fns";
import EmailComposer from "@/components/sales/EmailComposer";
import IphoneDialer from "@/components/sales/IphoneDialer";
import ContactSearch from "@/components/sales/ContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import ChatTab from "@/components/sales/ChatTab";
import CalendarTab from "@/components/sales/CalendarTab";
import AiAssistantTab from "@/components/sales/AiAssistantTab";
import ActivityArchive from "@/components/sales/ActivityArchive";
import DailyCallQueue from "@/components/sales/DailyCallQueue";

export default function AdminActivityPage({ user: propsUser, initialSubTab, onVideoCallStateChange, onVideoCallStarted, onVideoCallEnded }) {
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

  // Load contacts when modal opens
  React.useEffect(() => {
    if (!showForm || !user?.email) return;
    setLoadingContacts(true);
    base44.entities.ActivityLog.filter({ sales_member_email: user.email }, '-activity_date', 100)
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

  const pastActivities = [...activities]
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.created_date || b.activity_date) - new Date(a.created_date || a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ActivityLog.create(data);
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
  const [currentPage, setCurrentPage] = useState(1);
  const [showFullPage, setShowFullPage] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const ACTIVITIES_PER_PAGE = 10;

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
    ? contacts.find(c => c.email === selectedContact)
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

        {activeTab === "activity" && showArchive && (
          <ActivityArchive
            salesMemberId={user?.id}
            salesMemberEmail={user?.email}
            onClose={() => setShowArchive(false)}
          />
        )}

        {activeTab === "activity" && !showArchive && (
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
                     <Card 
                       key={activity.id} 
                       style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184, 149, 106, 0.1)' }}
                       className="cursor-pointer hover:shadow-md transition"
                       onClick={() => handleActivityClick(activity)}
                     >
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
                  <>
                    {/* Current page activities */}
                    {(() => {
                      const startIdx = currentPage === 1 ? 0 : 5 + (currentPage - 2) * ACTIVITIES_PER_PAGE;
                      const endIdx = showFullPage ? startIdx + ACTIVITIES_PER_PAGE : startIdx + 5;
                      return pastActivities.slice(startIdx, endIdx).map((activity) => (
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
                                  <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                                  <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                                  {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                                  {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                                  <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '')}</p>
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
                      ));
                    })()}

                    {/* Load More button - shows 5 more on current page */}
                    {(() => {
                      const startIdx = currentPage === 1 ? 0 : 5 + (currentPage - 2) * ACTIVITIES_PER_PAGE;
                      const remainingOnPage = pastActivities.slice(startIdx + 5, startIdx + ACTIVITIES_PER_PAGE).length;
                      const hasNextPage = startIdx + ACTIVITIES_PER_PAGE < pastActivities.length;

                      return !showFullPage && remainingOnPage > 0 ? (
                        <div className="flex justify-center pt-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowFullPage(true)}
                            style={{ borderColor: '#B8956A', color: '#B8956A' }}
                          >
                            Load More
                          </Button>
                        </div>
                      ) : null;
                    })()}

                    {/* Previous/Next Page buttons */}
                    {(() => {
                      const startIdx = currentPage === 1 ? 0 : 5 + (currentPage - 2) * ACTIVITIES_PER_PAGE;
                      const hasNextPage = startIdx + ACTIVITIES_PER_PAGE < pastActivities.length;

                      return showFullPage ? (
                        <div className="flex justify-center gap-2 pt-2">
                          {currentPage > 1 && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setCurrentPage(currentPage - 1);
                                setShowFullPage(false);
                              }}
                              style={{ borderColor: '#B8956A', color: '#B8956A' }}
                            >
                              Previous Page
                            </Button>
                          )}
                          {hasNextPage && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setCurrentPage(currentPage + 1);
                                setShowFullPage(false);
                              }}
                              style={{ borderColor: '#B8956A', color: '#B8956A' }}
                            >
                              Next Page
                            </Button>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Archive button */}
            <div className="flex justify-center pb-4">
              <Button
                variant="outline"
                onClick={() => setShowArchive(true)}
                className="gap-2"
                style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}
              >
                <Archive className="w-4 h-4" />
                View Activity Archive
              </Button>
            </div>
          </>
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
                     <p><span className="font-medium">Notes:</span> {selectedActivity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '')}</p>
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




        </div>
        </div>
        );
        }