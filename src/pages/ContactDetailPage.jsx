import React, { useState, useEffect } from "react";
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
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadActivities();
  }, [contactKey]);

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
        </DialogContent>
      </Dialog>

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