import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Building2, User, Clock, ChevronDown, ChevronUp, X, ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { createPortal } from "react-dom";
import { createPageUrl } from "@/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import FloatingChatBubble from "@/components/sales/FloatingChatBubble";
import { CallStatusProvider } from "@/components/CallStatusContext";
import CallMapModal from "@/components/sales/CallMapModal";

export default function ContactDetailPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const contactKey = params.get("contact");
  
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [callMapActivity, setCallMapActivity] = useState(null);
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    loadActivities();
  }, [contactKey]);

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
      const filtered = all.filter(a => (a.contact_email || a.contact_name) === contactKey).sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
      setActivities(filtered);
      
      if (filtered.length > 0) {
        setContact({
          key: contactKey,
          name: filtered[0].contact_name || '',
          email: filtered[0].contact_email || '',
          company: filtered[0].company_name || '',
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
              </div>
              <p className="text-sm mt-2" style={{ color: 'rgba(26,26,26,0.6)' }}>
                {activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>

          {/* Follow-up button / form */}
          <div className="mt-4">
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

      {/* Activity Detail Modal */}
      <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open && !zoomedImage) setSelectedActivity(null); }}>
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
                      <a
                        href={`tel:${selectedActivity.contact_phone}`}
                        className="hover:underline"
                        style={{ color: '#B8956A', cursor: 'pointer' }}
                      >
                        {selectedActivity.contact_phone}
                      </a>
                    </p>
                  )}
                  {selectedActivity.company_name && <p><span className="font-medium">Company:</span> {selectedActivity.company_name}</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call Map Modal */}
      {callMapActivity && (() => {
        const raw = callMapActivity.notes || '';
        const mapMatch = raw.match(/--- CALL MAP ---\s*([\s\S]*)/i);
        const callMap = mapMatch ? mapMatch[1].trim() : '';
        return (
          <CallMapModal
            open={!!callMapActivity}
            onClose={() => setCallMapActivity(null)}
            contactName={callMapActivity.contact_name || callMapActivity.company_name || 'Contact'}
            callMap={callMap}
            contactPhone={callMapActivity.contact_phone || ''}
            contactEmail={callMapActivity.contact_email || ''}
            onCall={(phone) => { localStorage.setItem('_dialerPhone', phone); window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone } })); }}
            onEmail={(email) => { localStorage.setItem('_emailTo', email); window.dispatchEvent(new CustomEvent('openEmailComposer', { detail: { email } })); }}
          />
        );
      })()}

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