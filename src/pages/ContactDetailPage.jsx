import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Building2, User, UserPlus, Tag, Clock, ChevronDown, ChevronUp, X, ArrowLeft, Plus, Trash2, Pencil, Briefcase } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { createPortal } from "react-dom";
import { createPageUrl } from "@/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import FloatingChatBubble from "@/components/sales/FloatingChatBubble";
import LogActivityModal from "@/components/sales/LogActivityModal";
import ConvertToJobModal from "@/components/sales/ConvertToJobModal";
import ConvertToCustomerModal from "@/components/sales/ConvertToCustomerModal";
import DiscountRequestModal from "@/components/sales/DiscountRequestModal";
import Customer360 from "@/components/sales/Customer360";
import { CallStatusProvider } from "@/components/CallStatusContext";
import CallMapModal from "@/components/sales/CallMapModal";
import ContactOwnerDropdown from "@/components/sales/ContactOwnerDropdown";

export default function ContactDetailPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const contactKey = params.get("contact");
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [callMapActivity, setCallMapActivity] = useState(null);
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showConvertCustomerModal, setShowConvertCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [repReassignmentEnabled, setRepReassignmentEnabled] = useState(true);

  const queryClient = useQueryClient();

  useEffect(() => {
    loadActivities();
  }, [contactKey]);

  // Determine admin status (sales session role or platform auth role)
  useEffect(() => {
    const salesRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
    if (salesRole === 'admin') {
      setIsAdmin(true);
    }
    base44.auth.isAuthenticated().then(isAuth => {
      if (isAuth) {
        base44.auth.me().then(me => {
          if (me?.role === 'admin') setIsAdmin(true);
        }).catch(() => {});
      }
    }).catch(() => {});

    // Fetch org-wide setting for non-admin reassignment (default enabled)
    base44.entities.AppSetting.filter({ key: "non_admin_contact_reassignment" })
      .then(rows => {
        if (rows && rows.length > 0) setRepReassignmentEnabled(rows[0].value !== "false");
      })
      .catch(() => {});
  }, []);

  // Listen for openDialer event and store phone for dialer
  useEffect(() => {
    const handleOpenDialer = (e) => {
      const phone = e.detail?.phone;
      if (phone) {
        localStorage.setItem('_dialerPhone', phone);
        // Dispatch event to parent to open dialer without navigation
        window.dispatchEvent(new CustomEvent('showDialer', { detail: { phone } }));
      }
    };
    window.addEventListener('openDialer', handleOpenDialer);
    return () => window.removeEventListener('openDialer', handleOpenDialer);
  }, []);

  // Subscribe to ActivityLog changes for real-time call map updates
  useEffect(() => {
    if (!contactKey) return;
    
    const unsubscribe = base44.entities.ActivityLog.subscribe((event) => {
      if (event.data?.contact_email === contactKey || event.data?.contact_name === contactKey) {
        loadActivities();
      }
    });
    
    return unsubscribe;
  }, [contactKey]);

  const handleLogFollowUp = async () => {
    if (!followUpData.notes || !followUpData.activity_date) return;
    setSaving(true);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
      await base44.entities.ActivityLog.create({
        activity_type: followUpData.activity_type,
        contact_name: contact?.name || contactKey,
        contact_email: contact?.email || '',
        company_name: contact?.company || '',
        activity_date: new Date(followUpData.activity_date).toISOString(),
        notes: followUpData.notes,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
      });
      setShowFollowUpForm(false);
      setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
      await loadActivities();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const loadActivities = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.ActivityLog.list('-activity_date', 500);
      const filtered = all.filter(a => {
        if (a.contact_email !== contactKey && a.contact_name !== contactKey) return false;
        // Filter out HubSpot sync logs (auto-created when contact is updated)
        const notes = a.notes || '';
        if (/^Contact updated:/i.test(notes)) return false;
        return true;
      }).sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
      setActivities(filtered);

      // ── Also fetch the Contact entity to check customer status ──
      let contactEntity = null;
      try {
        const contactResults = await base44.entities.Contact.filter({ email: contactKey });
        if (contactResults && contactResults.length > 0) {
          contactEntity = contactResults[0];
        }
      } catch (ce) {
        // Contact entity lookup is best-effort
      }

      if (contactEntity && contactEntity.lifecycle_stage === 'customer') {
        setIsCustomer(true);
        const fullName = [contactEntity.firstname, contactEntity.lastname].filter(Boolean).join(' ') || contactEntity.email || contactKey;
        // Spread the full contactEntity so canonical Arriv One Customer360 intelligence
        // fields (engagement_score, sales_memory, next_best_action, etc.) are available
        // to the Customer360 / CustomerIntelligencePanel. Estate Media reads these but
        // never writes them — Arriv One is authoritative.
        setContact({
          ...contactEntity,
          key: contactKey,
          name: fullName,
          email: contactEntity.email || contactKey,
          company: contactEntity.company || '',
          phone: contactEntity.phone || '',
          lead_status: contactEntity.lead_status,
          lifecycle_stage: contactEntity.lifecycle_stage,
        });
      } else if (filtered.length > 0) {
        const contactEmail = filtered[0].contact_email || '';
        const contactName = filtered[0].contact_name || '';
        let phone = filtered[0].contact_phone || '';

        const baseContact = {
          key: contactKey,
          name: contactName,
          email: contactEmail,
          company: filtered[0].company_name || '',
          phone,
          // Preserve Contact entity id + sales_member_id so the owner
          // reassignment dropdown works even for non-customer contacts.
          id: contactEntity?.id,
          sales_member_id: contactEntity?.sales_member_id,
        };
        setContact(baseContact);

        // Fetch from HubSpot for phone if not found
        if (!phone && contactEmail) {
          try {
            const res = await base44.functions.invoke('searchHubSpotContacts', { query: contactEmail });
            const contacts = res?.data?.contacts || [];
            if (contacts.length > 0) {
              // Try exact email match first
              let match = contacts.find(r => r.email?.toLowerCase() === contactEmail.toLowerCase());
              // Fall back to first result if no exact match
              if (!match) match = contacts[0];

              const hsPhone = match?.phone || '';
              if (hsPhone) {
                setContact(prev => ({ ...prev, phone: hsPhone }));
              }
            }
          } catch (hsError) {
            console.error('HubSpot search error:', hsError);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActivity = async (activity, e) => {
    e.stopPropagation();
    if (!confirm('Delete this activity?')) return;
    await base44.entities.ActivityLog.delete(activity.id);
    setActivities(prev => prev.filter(a => a.id !== activity.id));
  };

  const activityIcons = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Clock className="w-4 h-4" />,
    task: <Clock className="w-4 h-4" />,
    note: <Clock className="w-4 h-4" />,
  };

  const activityLabels = {
    call: "Call",
    email: "Email",
    meeting: "Meeting",
    task: "Task",
    note: "Note",
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="max-w-4xl mx-auto">
          <p style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Contact not found</p>
        </div>
      </div>
    );
  }

  // ── POST-CONVERSION: Customer 360 view ──
  if (isCustomer) {
    return (
      <Customer360
        contact={contact}
        contactKey={contactKey}
        activities={activities}
        onReload={loadActivities}
      />
    );
  }

  // ── PRE-CONVERSION: existing lead/prospect detail view (unchanged) ──
  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="mb-4 gap-2"
          style={{ color: '#B8956A' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Contacts
        </Button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
              <User className="w-6 h-6" style={{ color: '#B8956A' }} />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>{contact.name || contact.email}</h1>
              <div className="flex flex-wrap gap-3 mt-2 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
                {contact.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{contact.email}</span>}
                {contact.company && <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{contact.company}</span>}
                {contact.phone && (
                   <button
                     onClick={() => {
                       localStorage.setItem('_dialerPhone', contact.phone);
                       window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                     }}
                     className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                     style={{ color: '#B8956A' }}
                   >
                     <Phone className="w-4 h-4" />{contact.phone}
                   </button>
                 )}
              </div>
              <p className="text-sm mt-2" style={{ color: 'rgba(26,26,26,0.6)' }}>
                {activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}
              </p>
              {contact?.id && (isAdmin || repReassignmentEnabled) && (
                <div className="mt-3">
                  <ContactOwnerDropdown contactId={contact.id} salesMemberId={contact.sales_member_id} />
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
           <div className="mt-4 flex flex-wrap gap-2 items-start">
             <Button
               size="sm"
               className="gap-2"
               style={{ backgroundColor: '#B8956A', color: '#fff' }}
               onClick={() => setShowLogActivity(true)}
             >
               <Plus className="w-4 h-4" />
               Log Activity
             </Button>
             <Button
               size="sm"
               className="gap-2"
               style={{ backgroundColor: '#1A1A1A', color: '#fff' }}
               onClick={() => setShowConvertModal(true)}
             >
               <Briefcase className="w-4 h-4" />
               Convert to Job
             </Button>
             <Button
               size="sm"
               className="gap-2"
               style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
               onClick={() => setShowConvertCustomerModal(true)}
             >
               <UserPlus className="w-4 h-4" />
               Convert to Customer
             </Button>
             <Button
               size="sm"
               variant="outline"
               className="gap-2"
               style={{ borderColor: '#B8956A', color: '#B8956A' }}
               onClick={() => setShowDiscountModal(true)}
             >
               <Tag className="w-4 h-4" />
               Request Discount
             </Button>
             {contact.phone && (
               <TooltipProvider>
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <Button
                       size="sm"
                       className="gap-2"
                       style={{ backgroundColor: '#B8956A', color: '#fff' }}
                       onClick={() => {
                         localStorage.setItem('_dialerPhone', contact.phone);
                         window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                       }}
                     >
                       <Phone className="w-4 h-4" />
                       Call
                     </Button>
                   </TooltipTrigger>
                   <TooltipContent>{contact.phone}</TooltipContent>
                 </Tooltip>
               </TooltipProvider>
             )}
           </div>

          {/* Follow-up button / form */}
          <div className="mt-3">
            {showFollowUpForm ? (
              <div className="space-y-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.3)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Schedule Follow-up</p>
                <Select value={followUpData.activity_type} onValueChange={v => setFollowUpData(p => ({ ...p, activity_type: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="datetime-local"
                  value={followUpData.activity_date}
                  onChange={e => setFollowUpData(p => ({ ...p, activity_date: e.target.value }))}
                  className="h-9 text-sm"
                />
                <Textarea
                  placeholder="What's the plan for this follow-up?"
                  value={followUpData.notes}
                  onChange={e => setFollowUpData(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleLogFollowUp}
                    disabled={saving || !followUpData.notes || !followUpData.activity_date}
                    style={{ backgroundColor: '#B8956A', color: '#fff' }}
                  >
                    {saving ? 'Saving...' : 'Save Follow-up'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                style={{ borderColor: '#B8956A', color: '#B8956A' }}
                onClick={() => {
                  setShowFollowUpForm(true);
                  setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
                }}
              >
                <Plus className="w-4 h-4" />
                Schedule Follow-up
              </Button>
            )}
          </div>
        </div>

        {/* Activities */}
        <div className="space-y-3">
          {activities.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
                <p>No activities yet</p>
              </CardContent>
            </Card>
          ) : (
            activities.map((activity) => (
              <Card
                key={activity.id}
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => setSelectedActivity(activity)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)' }}>
                        {activityIcons[activity.activity_type]}
                      </div>
                      <div className="flex-1">
                        <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                        {(() => {
                         const raw = (activity.notes || '').replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '');
                         const hasCallMap = raw.includes('--- CALL MAP ---') || raw.includes('CALL MAP');
                         const shortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
                         return (
                           <div className="mt-2 flex items-start gap-2 flex-wrap">
                             {shortNote && <p className="text-sm flex-1" style={{ color: '#1A1A1A' }}>{shortNote.slice(0, 100)}{shortNote.length > 100 ? '...' : ''}</p>}
                             {hasCallMap && (
                               <button
                                 onClick={(e) => { e.stopPropagation(); setCallMapActivity(activity); }}
                                 className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-80"
                                 style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}
                               >
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
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-sm whitespace-nowrap" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                        {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                      </span>
                      <button
                        onClick={(e) => handleDeleteActivity(activity, e)}
                        className="p-1 rounded hover:bg-red-50 transition-colors"
                        style={{ color: 'rgba(26,26,26,0.3)' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(26,26,26,0.3)'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Activity Detail Modal */}
      <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open && !zoomedImage) { setSelectedActivity(null); setEditingActivity(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex justify-between items-center pr-6">
              <DialogTitle>Activity Details</DialogTitle>
              {selectedActivity && (
                <div className="flex gap-2">
                  {!editingActivity && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#B8956A' }}
                      onClick={() => setEditingActivity({
                        notes: (selectedActivity.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim(),
                        activity_type: selectedActivity.activity_type,
                        activity_date: selectedActivity.activity_date ? new Date(selectedActivity.activity_date).toISOString().slice(0,16) : '',
                        duration_minutes: selectedActivity.duration_minutes || '',
                      })}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Delete this activity?')) return;
                      await base44.entities.ActivityLog.delete(selectedActivity.id);
                      setActivities(prev => prev.filter(a => a.id !== selectedActivity.id));
                      setSelectedActivity(null);
                      setEditingActivity(null);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-6">
              {editingActivity ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Type</label>
                    <Select value={editingActivity.activity_type} onValueChange={v => setEditingActivity(p => ({ ...p, activity_type: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Date & Time</label>
                    <Input type="datetime-local" className="h-9 text-sm" value={editingActivity.activity_date} onChange={e => setEditingActivity(p => ({ ...p, activity_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Duration (minutes)</label>
                    <Input type="number" className="h-9 text-sm" value={editingActivity.duration_minutes} onChange={e => setEditingActivity(p => ({ ...p, duration_minutes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Notes</label>
                    <Textarea className="text-sm" rows={4} value={editingActivity.notes} onChange={e => setEditingActivity(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingActivity(null)}>Cancel</Button>
                    <Button size="sm" disabled={isSavingEdit} style={{ backgroundColor: '#B8956A', color: '#fff' }}
                      onClick={async () => {
                        setIsSavingEdit(true);
                        // Preserve call map portion if it existed
                        const raw = selectedActivity.notes || '';
                        const callMapMatch = raw.match(/(\n\n--- CALL MAP ---[\s\S]*)/i);
                        const callMapSuffix = callMapMatch ? callMapMatch[1] : '';
                        const updatedNotes = editingActivity.notes + callMapSuffix;
                        await base44.entities.ActivityLog.update(selectedActivity.id, {
                          activity_type: editingActivity.activity_type,
                          activity_date: new Date(editingActivity.activity_date).toISOString(),
                          duration_minutes: Number(editingActivity.duration_minutes) || 0,
                          notes: updatedNotes,
                        });
                        setActivities(prev => prev.map(a => a.id === selectedActivity.id ? { ...a, activity_type: editingActivity.activity_type, activity_date: new Date(editingActivity.activity_date).toISOString(), duration_minutes: Number(editingActivity.duration_minutes) || 0, notes: updatedNotes } : a));
                        setSelectedActivity(null);
                        setEditingActivity(null);
                        setIsSavingEdit(false);
                      }}
                    >
                      {isSavingEdit ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                        <div className="pt-2">
                          <button
                            onClick={() => { setCallMapActivity(selectedActivity); setSelectedActivity(null); }}
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                            style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}
                          >
                            📋 View Call Map
                          </button>
                        </div>
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
                      {selectedActivity.contact_phone && (
                        <p>
                          <span className="font-medium">Phone:</span>{' '}
                          <button
                            onClick={() => { localStorage.setItem('_dialerPhone', selectedActivity.contact_phone); window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: selectedActivity.contact_phone } })); }}
                            className="hover:underline"
                            style={{ color: '#B8956A', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                          >
                            {selectedActivity.contact_phone}
                          </button>
                        </p>
                      )}
                      {selectedActivity.company_name && <p><span className="font-medium">Company:</span> {selectedActivity.company_name}</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call Map Modal */}
       {callMapActivity && (() => {
         const raw = callMapActivity.notes || '';
         const mapMatch = raw.match(/--- CALL MAP ---\s*([\s\S]*)/i);
         const callMap = mapMatch ? mapMatch[1].trim() : '';
         const handleRegenerate = async (context) => {
           setRegenLoading(true);
           try {
             // Build rich history from all activities for this contact
             const contactActivities = activities
               .filter(a => a.contact_email === callMapActivity.contact_email || a.contact_name === callMapActivity.contact_name)
               .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
               .slice(0, 15);

             const activityHistory = contactActivities.map(a => {
               const dt = new Date(a.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
               const note = (a.notes || '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim();
               const pics = a.picture_urls?.length ? ` [+${a.picture_urls.length} attachment(s)]` : '';
               return `${dt} (${a.activity_type}): ${note.slice(0, 300)}${pics}`;
             }).join('\n');

             // Collect all picture/attachment URLs from history for LLM vision analysis
             const attachmentUrls = contactActivities
               .flatMap(a => a.picture_urls || [])
               .slice(0, 8);

             // Build contactIntel from notes on the contact record
             const contactIntel = [
               contact?.notes,
               context
             ].filter(Boolean).join('\n\n');

             // Detect recurring patterns (e.g. "has photographer", "too expensive")
             const allNotes = contactActivities.map(a => (a.notes || '').toLowerCase()).join(' ');
             const patternTags = [];
             if (/has.{0,20}photographer|already.{0,20}someone/.test(allNotes)) patternTags.push('has existing photographer');
             if (/too expensive|too much|price|cost/.test(allNotes)) patternTags.push('price sensitive');
             if (/not interested|no thanks|don.t need/.test(allNotes)) patternTags.push('previously declined');
             if (/call back|try again|follow.?up/.test(allNotes)) patternTags.push('requested follow-up');
             if (/busy|bad time|in a meeting/.test(allNotes)) patternTags.push('often busy');

             const res = await base44.functions.invoke('regenerateCallMap', {
               contactName: callMapActivity.contact_name,
               contactEmail: callMapActivity.contact_email,
               companyName: callMapActivity.company_name,
               contactPhone: callMapActivity.contact_phone || contact?.phone,
               reason: context,
               previousCallMap: callMap || undefined,
               activityHistory,
               contactIntel: contactIntel || undefined,
               patternTags: patternTags.length ? patternTags : undefined,
               pictureUrls: attachmentUrls.length ? attachmentUrls : undefined,
             });
             const newCallMap = res.data?.call_map;
             if (newCallMap) {
               const existingShortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').trim();
               const updatedNotes = `${existingShortNote}\n\n--- CALL MAP ---\n${newCallMap}`;
               await base44.entities.ActivityLog.update(callMapActivity.id, { notes: updatedNotes });
               setCallMapActivity(prev => ({ ...prev, notes: updatedNotes }));
               setActivities(prev => prev.map(a => a.id === callMapActivity.id ? { ...a, notes: updatedNotes } : a));
             }
           } catch (e) { console.error(e); }
           finally { setRegenLoading(false); }
         };
         const handleSaveCallMapEdit = async (editedText) => {
           const existingShortNote = raw.replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').trim();
           const updatedNotes = `${existingShortNote}\n\n--- CALL MAP ---\n${editedText}`;
           await base44.entities.ActivityLog.update(callMapActivity.id, { notes: updatedNotes });
           setCallMapActivity(prev => ({ ...prev, notes: updatedNotes }));
           setActivities(prev => prev.map(a => a.id === callMapActivity.id ? { ...a, notes: updatedNotes } : a));
           base44.functions.invoke('analyzeCallMapEdit', {
             salesMemberId: localStorage.getItem('sales_member_id'),
             salesMemberEmail: localStorage.getItem('sales_member_email'),
             originalCallMap: callMap,
             editedCallMap: editedText
           }).catch(() => {});
         };
         return (
           <CallMapModal
             open={!!callMapActivity}
             onClose={() => setCallMapActivity(null)}
             contactName={callMapActivity.contact_name || callMapActivity.company_name || 'Contact'}
             callMap={callMap}
             regenerating={regenLoading}
             contactPhone={contact?.phone || callMapActivity.contact_phone || ''}
             contactEmail={contact?.email || callMapActivity.contact_email || ''}
             onCall={(phone) => { localStorage.setItem('_dialerPhone', phone); window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone } })); }}
             onEmail={(email) => { localStorage.setItem('_emailTo', email); window.dispatchEvent(new CustomEvent('openEmailComposer', { detail: { email } })); }}
             onSaveEdit={handleSaveCallMapEdit}
             onRegenerate={handleRegenerate}
           />
         );
       })()}

      {/* Convert to Job Modal */}
      <ConvertToJobModal
        open={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        contact={contact}
        onSent={() => setShowConvertModal(false)}
      />

      {/* Convert to Customer Modal */}
      {showConvertCustomerModal && (
        <ConvertToCustomerModal
          contact={contact}
          onClose={() => setShowConvertCustomerModal(false)}
          onConverted={() => { setShowConvertCustomerModal(false); loadActivities(); }}
        />
      )}

      {/* Discount Request Modal */}
      {showDiscountModal && (
        <DiscountRequestModal
          contact={contact}
          onClose={() => setShowDiscountModal(false)}
        />
      )}

      {/* Log Activity Modal */}
      <LogActivityModal
        open={showLogActivity}
        onClose={() => setShowLogActivity(false)}
        contact={contact}
        salesMemberId={localStorage.getItem('sales_member_id')}
        salesMemberEmail={localStorage.getItem('sales_member_email')}
        onLogged={() => { setShowLogActivity(false); loadActivities(); }}
      />

      {/* Floating Chat Bubble */}
      <CallStatusProvider>
        <FloatingChatBubble />
      </CallStatusProvider>

      {/* Image Zoom Overlay */}
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
    </div>
  );
}