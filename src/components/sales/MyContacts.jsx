import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, Calendar, Building2, User, Plus, Clock, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { createPageUrl } from "@/utils";

export default function MyContacts({ salesMemberId, salesMemberEmail }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedContact, setExpandedContact] = useState(null);
  const [showFollowUpForm, setShowFollowUpForm] = useState(null); // contactKey being followed up
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [saving, setSaving] = useState(false);
  const [secondaryInfo, setSecondaryInfo] = useState({});

  useEffect(() => {
    loadActivities();
    loadSecondaryInfo();
    // Subscribe to real-time updates
    const unsub = base44.entities.ActivityLog.subscribe((event) => {
      loadActivities();
    });
    const unsub2 = base44.entities.SecondaryContactInfo.subscribe((event) => {
      loadSecondaryInfo();
    });
    return () => {
      unsub();
      unsub2();
    };
  }, [salesMemberId, salesMemberEmail]);

  const loadSecondaryInfo = async () => {
    try {
      const all = await base44.entities.SecondaryContactInfo.list();
      const map = {};
      all.forEach(info => {
        map[info.contact_email] = info;
      });
      setSecondaryInfo(map);
    } catch (e) {
      console.error(e);
    }
  };

  const loadActivities = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.ActivityLog.list('-activity_date', 500);
      // Filter to only this rep's activities
      const mine = all.filter(a =>
        a.sales_member_id === salesMemberId ||
        a.sales_member_email === salesMemberEmail ||
        a.created_by === salesMemberEmail
      );
      setActivities(mine);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Group by contact (by email or name)
  const contactMap = {};
  activities.forEach(a => {
    const key = a.contact_email || a.contact_name || 'Unknown';
    if (!contactMap[key]) {
      contactMap[key] = {
        key,
        name: a.contact_name || '',
        email: a.contact_email || '',
        company: a.company_name || '',
        activities: [],
        upcoming: [],
        past: [],
      };
    }
    contactMap[key].activities.push(a);
    if (new Date(a.activity_date) > new Date()) {
      contactMap[key].upcoming.push(a);
    } else {
      contactMap[key].past.push(a);
    }
    // Merge best known name/company
    if (!contactMap[key].name && a.contact_name) contactMap[key].name = a.contact_name;
    if (!contactMap[key].company && a.company_name) contactMap[key].company = a.company_name;
  });

  const contacts = Object.values(contactMap).filter(c => {
    const name = c.name && c.name.trim();
    if (!name) return false;
    // Exclude phone numbers (start with + or are all digits/dashes)
    if (/^\+?\d[\d\s\-().]+$/.test(name)) return false;
    // Exclude pure numeric strings (e.g. extensions like "101", "100")
    if (/^\d+$/.test(name)) return false;
    return true;
  }).sort((a, b) => {
    const latestA = Math.max(...a.activities.map(x => new Date(x.activity_date)));
    const latestB = Math.max(...b.activities.map(x => new Date(x.activity_date)));
    return latestB - latestA;
  });

  const upcomingTotal = contacts.reduce((sum, c) => sum + c.upcoming.length, 0);

  const activityIcons = {
    call: <Phone className="w-3 h-3" />,
    email: <Mail className="w-3 h-3" />,
    meeting: <Calendar className="w-3 h-3" />,
  };
  const activityColors = {
    call: '#3b82f6',
    email: '#8b5cf6',
    meeting: '#10b981',
  };

  const handleLogFollowUp = async () => {
    if (!followUpData.notes || !followUpData.activity_date) return;
    setSaving(true);
    try {
      const contact = contacts.find(c => c.key === showFollowUpForm);
      await base44.entities.ActivityLog.create({
        activity_type: followUpData.activity_type,
        contact_name: contact?.name || showFollowUpForm,
        contact_email: contact?.email || '',
        company_name: contact?.company || '',
        activity_date: new Date(followUpData.activity_date).toISOString(),
        notes: followUpData.notes,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
      });
      setShowFollowUpForm(null);
      setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
      await loadActivities();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
          <User className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No contacts yet</p>
          <p className="text-sm mt-1">Contacts will appear here after you log activities or make calls.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>My Contacts</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} you've worked with
            {upcomingTotal > 0 && <span className="ml-2 font-medium text-[#B8956A]">· {upcomingTotal} upcoming task{upcomingTotal !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {contacts.map((contact) => {
          const isExpanded = expandedContact === contact.key;
          const lastActivity = contact.past[0];
          const nextActivity = contact.upcoming[0];

          return (
            <Card
               key={contact.key}
               style={{ borderColor: contact.upcoming.length > 0 ? '#B8956A' : 'rgba(184,149,106,0.2)', borderWidth: contact.upcoming.length > 0 ? '1.5px' : '1px' }}
               className="cursor-pointer hover:shadow-md transition"
             >
               <CardContent className="pt-4 pb-4">
                 {/* Header row */}
                 <button
                   className="w-full text-left flex items-start justify-between gap-3"
                   onClick={() => {
                     // Determine the right back URL based on current page
                     const isAdminHub = window.location.pathname.includes('AdminHub');
                     const backUrl = window.location.pathname + (isAdminHub ? '?tab=activity&subtab=mycontacts' : '?tab=mycontacts');
                     window.history.pushState(null, '', backUrl);
                     window.location.href = createPageUrl(`ContactDetailPage?contact=${encodeURIComponent(contact.key)}`);
                   }}
                 >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-full shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
                      <User className="w-4 h-4" style={{ color: '#B8956A' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold" style={{ color: '#1A1A1A' }}>
                          {contact.name || contact.email || 'Unknown Contact'}
                        </p>
                        {contact.upcoming.length > 0 && (
                          <Badge className="text-xs" style={{ backgroundColor: '#B8956A', color: '#fff', border: 'none' }}>
                            {contact.upcoming.length} upcoming
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                        {contact.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{contact.company}</span>}
                      </div>
                      {secondaryInfo[contact.email] && (
                        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                          {secondaryInfo[contact.email].secondary_names?.length > 0 && (
                            <div className="text-xs mb-1">
                              <span style={{ color: 'rgba(26,26,26,0.5)' }}>Additional contacts: </span>
                              <span style={{ color: '#1A1A1A' }}>{secondaryInfo[contact.email].secondary_names.join(', ')}</span>
                            </div>
                          )}
                          {secondaryInfo[contact.email].secondary_emails?.length > 0 && (
                            <div className="text-xs mb-1">
                              <span style={{ color: 'rgba(26,26,26,0.5)' }}>Other emails: </span>
                              <span style={{ color: '#1A1A1A' }}>{secondaryInfo[contact.email].secondary_emails.join(', ')}</span>
                            </div>
                          )}
                          {secondaryInfo[contact.email].secondary_phones?.length > 0 && (
                            <div className="text-xs">
                              <span style={{ color: 'rgba(26,26,26,0.5)' }}>Other phones: </span>
                              <span style={{ color: '#1A1A1A' }}>
                                {secondaryInfo[contact.email].secondary_phones.map((phone, idx) => (
                                  <a
                                    key={idx}
                                    href={`tel:${phone}`}
                                    className="hover:underline"
                                    style={{ color: '#B8956A', cursor: 'pointer' }}
                                  >
                                    {phone}{idx < secondaryInfo[contact.email].secondary_phones.length - 1 ? ', ' : ''}
                                  </a>
                                ))}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex gap-3 mt-2 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                        <span>{contact.activities.length} activit{contact.activities.length !== 1 ? 'ies' : 'y'}</span>
                        {lastActivity && (
                          <span>Last: {formatDistanceToNow(new Date(lastActivity.activity_date), { addSuffix: true })}</span>
                        )}
                        {nextActivity && (
                          <span className="font-medium" style={{ color: '#B8956A' }}>
                            Next: {format(new Date(nextActivity.activity_date), "MMM d 'at' h:mm a")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0 opacity-50" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0 opacity-50" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>

                    {/* Upcoming tasks */}
                    {contact.upcoming.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#B8956A' }}>Upcoming Tasks</p>
                        <div className="space-y-2">
                          {contact.upcoming.map(a => (
                            <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.08)', borderLeft: '3px solid #B8956A' }}>
                              <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#B8956A' }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs capitalize">{a.activity_type}</Badge>
                                  <span className="text-xs font-medium" style={{ color: '#B8956A' }}>
                                    {format(new Date(a.activity_date), "MMM d 'at' h:mm a")}
                                  </span>
                                </div>
                                <p className="text-sm mt-1" style={{ color: '#1A1A1A' }}>{a.notes.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Activity history */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(26,26,26,0.5)' }}>Activity History</p>
                      <div className="space-y-2">
                        {contact.past.slice(0, 5).map(a => (
                          <div key={a.id} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${activityColors[a.activity_type]}20`, color: activityColors[a.activity_type] }}>
                              {activityIcons[a.activity_type]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                                <span className="capitalize font-medium">{a.activity_type}</span>
                                <span>·</span>
                                <span>{format(new Date(a.activity_date), "MMM d, yyyy")}</span>
                                {a.duration_minutes > 0 && <span>· {a.duration_minutes}m</span>}
                              </div>
                              <p className="text-sm mt-0.5" style={{ color: '#1A1A1A' }}>{a.notes.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}</p>
                            </div>
                          </div>
                        ))}
                        {contact.past.length > 5 && (
                          <p className="text-xs text-center" style={{ color: 'rgba(26,26,26,0.4)' }}>+{contact.past.length - 5} more activities</p>
                        )}
                      </div>
                    </div>

                    {/* Log follow-up button */}
                    {showFollowUpForm === contact.key ? (
                      <div className="space-y-3 p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.3)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Schedule Follow-up</p>
                        <Select value={followUpData.activity_type} onValueChange={v => setFollowUpData(p => ({ ...p, activity_type: v }))}>
                          <SelectTrigger className="h-8 text-sm">
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
                          className="h-8 text-sm"
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
                          <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 w-full"
                        style={{ borderColor: '#B8956A', color: '#B8956A' }}
                        onClick={() => {
                          setShowFollowUpForm(contact.key);
                          setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        Schedule Follow-up
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}