import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, Building2, Phone, Mail, FileText, Timer, Image, Trash2, Eye, Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CallMapModal from "./CallMapModal";

export default function ActivityDetailModal({ activity, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [showCallMap, setShowCallMap] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [script, setScript] = useState(activity?.call_map || null);
  
  if (!activity) return null;

  useEffect(() => {
    setScript(activity?.call_map || null);
  }, [activity?.id]);

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    setDeleting(true);
    try {
      await base44.entities.ActivityLog.delete(activity.id);
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow DB to sync
      onDelete?.(activity.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete activity:', err);
      alert('Failed to delete activity');
    } finally {
      setDeleting(false);
    }
  };

  const generateCallMap = async () => {
    setGeneratingScript(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are generating a hyper-personalized, research-backed COMPLETE CALL MAP for a sales representative for ARRIV Estate Media LLC (real estate photography, video, drone).

**CRITICAL: GENERATE EVERY SINGLE SECTION BELOW. NO SKIPPING. NO PARTIAL SCRIPTS. THIS IS A FULL CONVERSATION GUIDE WITH EVERY BRANCH OUTCOME.**

## CONTACT INFO
- Name: ${activity.contact_name || 'the contact'}
- Company: ${activity.company_name || 'their brokerage'}
- Last Activity: ${activity.notes?.slice(0, 100) || "routine follow-up"}

---

## TONE & APPROACH
- Write exactly like humans talk (short sentences, contractions, natural pauses)
- NO buzzwords like "leverage," "synergy," "value proposition"
- Open with something unexpected to break auto-reject
- Reference their specific market or situation
- Confident but relaxed — like a colleague you know
- If they push back, acknowledge genuinely first

---

## OUTPUT AS MARKDOWN (NOT JSON)
Generate the sections below using markdown formatting. Each section should be complete, full scripts (not abbreviated).

### 📞 Opening Line
(2-3 sentences verbatim for what the rep should say when they pick up)

### 🔀 If They're Interested / Ask Questions
(3-4 sentences: acknowledge interest, reference their specific situation, explain value, ask availability)

### 🔀 If They Say "I Already Have a Photographer"
(3-4 sentences: acknowledge, don't argue, explain ARRIV difference, plant seed without being pushy)

### 🔀 If They Say "Not Interested Right Now"
(3-4 sentences: thank them, respect timeline, explain you're not a bother, offer to circle back in 4-6 weeks)

### 🔀 If They Say "Just Send Me an Email"
(3-4 sentences: agree to email BUT lock in follow-up call for 1 week, make them expect your call)

### 🔀 If They Ask "What's Your Pricing?"
(3-4 sentences: value-first answer, depends on needs, offer to discuss on call, redirect to booking time)

### 🔀 If They Say "I'm Busy / Bad Time to Talk"
(3-4 sentences: respect time completely, ask when next week is better, lock in specific callback time)

### 🔀 If They're Cold / One-Word Answers / Not Engaging
(2-3 sentences: graceful exit, NO hard sell, positive impression, offer to check back in weeks)

### 📵 Voicemail Script
(Word-for-word what rep should say if voicemail picks up. UNDER 20 seconds when spoken. Include callback number.)

### 📱 Follow-Up Text
(Short SMS 2-3 sentences max. Send immediately after voicemail. Casual, friendly, not salesy.)

### 🏁 Closing / Natural Handoff
(2-3 sentences: how rep closes if lead says yes or asks for more. Natural handoff with next steps clear.)

---

**GENERATE ALL 11 SECTIONS ABOVE. DO NOT ABBREVIATE. EACH SECTION MUST BE COMPLETE WITH FULL SENTENCES.**`,
      });

      const generatedScript = typeof res === "string" ? res : res?.text || String(res);
      setScript(generatedScript);

      // Save back to the activity
      await base44.entities.ActivityLog.update(activity.id, {
        call_map: generatedScript
      });
    } catch (err) {
      console.error('Failed to generate call map:', err);
      setScript("Failed to generate script. Try again.");
    } finally {
      setGeneratingScript(false);
    }
  };

  const typeColors = {
    call: "bg-blue-100 text-blue-800",
    email: "bg-green-100 text-green-800",
    meeting: "bg-purple-100 text-purple-800",
  };

  const date = new Date(activity.activity_date);

  return (
    <Dialog open={!!activity} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Badge className={typeColors[activity.activity_type] || "bg-gray-100 text-gray-800"}>
                {activity.activity_type}
              </Badge>
              <span className="text-sm font-normal text-gray-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Contact Info */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
            {activity.contact_name && (
              <div className="flex items-center gap-2 text-gray-700">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">{activity.contact_name}</span>
              </div>
            )}
            {activity.contact_email && (
              <div className="flex items-center gap-2 text-gray-700">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                {activity.contact_email}
              </div>
            )}
            {activity.company_name && (
              <div className="flex items-center gap-2 text-gray-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                {activity.company_name}
              </div>
            )}
            {activity.sales_member_email && (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <User className="w-3 h-3" />
                Rep: {activity.sales_member_email}
              </div>
            )}
            {activity.duration_minutes > 0 && (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Timer className="w-3 h-3" />
                Duration: {activity.duration_minutes} min
              </div>
            )}
          </div>

          {/* Call Map (if present) */}
          {activity.call_map && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>AI Call Map</p>
              </div>
              <Button
                onClick={() => setShowCallMap(true)}
                className="w-full gap-2"
                style={{ backgroundColor: '#B8956A', color: '#fff' }}
                size="sm"
              >
                <Eye className="w-4 h-4" />
                View Full Call Map
              </Button>
            </div>
          )}

          {/* Notes / Content */}
          {activity.notes && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Notes / Content</p>
              </div>
              {(() => {
                const raw = activity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '');
                const screenshotMarker = '\n\n[Screenshots]\n';
                const markerIdx = raw?.indexOf('[Screenshots]\n');
                if (markerIdx !== undefined && markerIdx >= 0) {
                  const notesOnly = raw.slice(0, raw.indexOf('\n\n[Screenshots]')).trim();
                  const screenshotUrls = raw.slice(markerIdx + '[Screenshots]\n'.length).trim().split('\n').filter(Boolean);
                  return (
                    <>
                      <div className="bg-white border rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-2" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
                        {notesOnly}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Image className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Attachments ({screenshotUrls.length})</p>
                        </div>
                        {screenshotUrls.map((url, i) => {
                          const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
                          return isImage ? (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`attachment-${i+1}`} className="max-w-full max-h-48 rounded-lg border border-gray-200 hover:opacity-90 transition" />
                            </a>
                          ) : (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-[#B8956A] underline">
                              📎 Attachment {i + 1}
                            </a>
                          );
                        })}
                      </div>
                    </>
                  );
                }
                return (
                  <div className="bg-white border rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
                    {raw}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Follow-ups (upcoming activities linked to same contact) */}
          {activity._followUps && activity._followUps.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Follow-ups ({activity._followUps.length})</p>
              </div>
              <div className="space-y-2">
                {activity._followUps.map((fu, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={typeColors[fu.activity_type] || "bg-gray-100 text-gray-800"} variant="outline">
                        {fu.activity_type}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(fu.activity_date).toLocaleDateString()} {new Date(fu.activity_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {fu.notes && <p className="text-gray-700 text-xs">{fu.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Call Map Modal */}
          {showCallMap && activity.call_map && (
          <CallMapModal
            contact={{ name: activity.contact_name, phone: activity.contact_phone, email: activity.contact_email }}
            script={activity.call_map}
            onClose={() => setShowCallMap(false)}
          />
          )}
          </DialogContent>
          </Dialog>
          );
          }