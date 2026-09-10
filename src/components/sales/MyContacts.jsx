import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useSalesDashboardData } from "@/hooks/useSalesDashboardData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Mail, Calendar, Building2, User, UserPlus, Plus, Tag, Clock, CheckCircle2, Circle, ChevronDown, ChevronUp, Home } from "lucide-react";
import RealtorListingsPage from "@/components/sales/RealtorListingsPage";
import InAppBrowser from "@/components/sales/InAppBrowser";
import ConvertToCustomerModal from "./ConvertToCustomerModal";
import DiscountRequestModal from "./DiscountRequestModal";
import { format, formatDistanceToNow } from "date-fns";
import { createPageUrl } from "@/utils";

export default function MyContacts({ salesMemberId, salesMemberEmail, isAdmin }) {
  const [activities, setActivities] = useState([]);
  const [dbContacts, setDbContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedContact, setExpandedContact] = useState(null);
  const [contactsPage, setContactsPage] = useState(0);
  const [visibleContactsOnPage, setVisibleContactsOnPage] = useState(5);
  const [showFollowUpForm, setShowFollowUpForm] = useState(null); // contactKey being followed up
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [saving, setSaving] = useState(false);
  const [secondaryInfo, setSecondaryInfo] = useState({});
  const [listingsContact, setListingsContact] = useState(null);
  const [convertContact, setConvertContact] = useState(null);
  const [discountContact, setDiscountContact] = useState(null);

  // Fetch all data via backend function (bypasses RLS for sales-authenticated users)
  const { data: dashboardData, refetch } = useSalesDashboardData(salesMemberId);

  // Sync data from dashboard response
  useEffect(() => {
    if (dashboardData) {
      setActivities(dashboardData.activities || []);
      setDbContacts(dashboardData.contacts || []);
      const secMap = {};
      (dashboardData.secondary_contact_info || []).forEach(info => {
        secMap[info.contact_email] = info;
      });
      setSecondaryInfo(secMap);
      setLoading(false);
    }
  }, [dashboardData]);

  // In-app navigation stack: clicking a contact's NAME opens their listings
  // inline, replacing that contact's card — identical functioning to the
  // prospect page (back/forward, minimize, close, toggle full-page).
  const [nav, setNav] = useState({ stack: [], index: -1 });
  const current = nav.index >= 0 ? nav.stack[nav.index] : null;
  const canBack = nav.index > 0;
  const canForward = nav.index >= 0 && nav.index < nav.stack.length - 1;
  const pushView = (entry) => setNav(prev => {
    const stack = prev.stack.slice(0, prev.index + 1);
    stack.push({ ...entry, mode: entry.mode || "inTab" });
    return { stack, index: stack.length - 1 };
  });
  const navBack = () => setNav(prev => prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev);
  const navForward = () => setNav(prev => (prev.index >= 0 && prev.index < prev.stack.length - 1) ? { ...prev, index: prev.index + 1 } : prev);
  const closeView = () => setNav({ stack: [], index: -1 });
  const toggleCurrentMode = () => setNav(prev => ({
    ...prev,
    stack: prev.stack.map((e, i) => i === prev.index ? { ...e, mode: e.mode === "fullPage" ? "inTab" : "fullPage" } : e)
  }));
  const showListingsForContact = (contact) => pushView({
    kind: "listings",
    contactKey: contact.key,
    realtor: { name: contact.name, brokerage: contact.company || '' }
  });
  const openListingFromListings = (url, contactKey) => pushView({ kind: "website", contactKey, url });

  // Cache fetched listings per contact so navigating back from an opened
  // listing restores the list instantly — no "Searching…" spinner (matches
  // the prospecting tab's listingsCacheRef behavior).
  const listingsCacheRef = useRef({});
  const contactListingsKey = (c) => `${c.name || ''}||${c.company || ''}`;

  useEffect(() => {
    // Guard: don't fetch until we know who the user is
    if (!salesMemberId) return;
    // Initial data comes from useSalesDashboardData hook above.
    // Subscribe to real-time updates — refetch the hook on any change.
    let unsub = () => {};
    let unsub2 = () => {};
    let unsub3 = () => {};
    try {
      unsub = base44.entities.ActivityLog.subscribe(() => refetch());
      unsub2 = base44.entities.SecondaryContactInfo.subscribe(() => refetch());
      unsub3 = base44.entities.Contact.subscribe(() => refetch());
    } catch (e) {
      console.error('[MyContacts] subscribe failed:', e);
    }
    return () => {
      unsub();
      unsub2();
      unsub3();
    };
  }, [salesMemberId, salesMemberEmail, refetch]);

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

    // AI-scheduled queue items should never appear in Activity History —
    // they are pending tasks, not completed activities
    const notes = a.notes || '';
    const isQueueScheduled = notes.includes('[AI Scheduled]') ||
      (notes.includes('--- CALL MAP ---') && !notes.includes('[Queue Call]'));

    if (new Date(a.activity_date) > new Date()) {
      contactMap[key].upcoming.push(a);
    } else if (!isQueueScheduled) {
      contactMap[key].past.push(a);
    }
    // Merge best known name/company
    if (!contactMap[key].name && a.contact_name) contactMap[key].name = a.contact_name;
    if (!contactMap[key].company && a.company_name) contactMap[key].company = a.company_name;
  });

  // Merge in Contact records from the Contact entity (e.g., migrated booking
  // clients) that may not have any ActivityLog entries yet. This ensures all
  // CRM contacts appear in the My Contacts list even before any activity is
  // logged against them.
  dbContacts.forEach(c => {
    const fullName = `${c.firstname || ''} ${c.lastname || ''}`.trim();
    const key = c.email || fullName || c.id;
    if (!contactMap[key]) {
      contactMap[key] = {
        key,
        name: fullName,
        email: c.email || '',
        company: c.company || '',
        activities: [],
        upcoming: [],
        past: [],
      };
    } else {
      // Fill in missing name/company from the Contact record
      if (!contactMap[key].name && fullName) contactMap[key].name = fullName;
      if (!contactMap[key].company && c.company) contactMap[key].company = c.company;
    }
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
      await base44.functions.invoke('manageSalesActivity', {
        action: 'create_activity',
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
        activity: {
          activity_type: followUpData.activity_type,
          contact_name: contact?.name || showFollowUpForm,
          contact_email: contact?.email || '',
          company_name: contact?.company || '',
          activity_date: new Date(followUpData.activity_date).toISOString(),
          notes: followUpData.notes,
        },
      });
      setShowFollowUpForm(null);
      setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
      refetch();
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
        {contacts.slice(contactsPage * 5, contactsPage * 5 + visibleContactsOnPage).map((contact) => {
          const isExpanded = expandedContact === contact.key;
          const lastActivity = contact.past[0];
          const nextActivity = contact.upcoming[0];
          const isCurrentView = current && current.contactKey === contact.key;

          if (isCurrentView && current.kind === "website") {
            return (
              <InAppBrowser
                key={contact.key}
                url={current.url}
                mode={current.mode}
                onMinimize={closeView}
                onClose={closeView}
                onToggleFull={toggleCurrentMode}
                onBack={navBack}
                onForward={navForward}
                canBack={canBack}
                canForward={canForward}
              />
            );
          }
          if (isCurrentView && current.kind === "listings") {
            return (
              <RealtorListingsPage
                key={contact.key}
                realtor={current.realtor}
                salesMemberId={salesMemberId}
                mode={current.mode}
                cachedListings={listingsCacheRef.current[contactListingsKey(contact)]}
                onCacheListings={(list) => {
                  listingsCacheRef.current[contactListingsKey(contact)] = list;
                }}
                onMinimize={closeView}
                onClose={closeView}
                onToggleFull={toggleCurrentMode}
                onBack={navBack}
                onForward={navForward}
                canBack={canBack}
                canForward={canForward}
                onOpenListing={(url) => openListingFromListings(url, contact.key)}
              />
            );
          }

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
                     window.location.href = createPageUrl('ContactDetailPage') + '?contact=' + encodeURIComponent(contact.key);
                   }}
                 >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-full shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
                      <User className="w-4 h-4" style={{ color: '#B8956A' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className="font-semibold hover:underline cursor-pointer inline-flex items-center gap-1"
                          style={{ color: '#1A1A1A' }}
                          title="View this contact's other listings"
                          onClick={(e) => { e.stopPropagation(); showListingsForContact(contact); }}
                        >
                          {contact.name || contact.email || 'Unknown Contact'}
                          <Home className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
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
                                  <button
                                    key={idx}
                                    onClick={() => { localStorage.setItem('_dialerPhone', phone); window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone } })); }}
                                    className="hover:underline"
                                    style={{ color: '#B8956A', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                                  >
                                    {phone}{idx < secondaryInfo[contact.email].secondary_phones.length - 1 ? ', ' : ''}
                                  </button>
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
                      <div className="space-y-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 w-full"
                          style={{ borderColor: '#B8956A', color: '#B8956A' }}
                          onClick={() => setListingsContact(contact)}
                        >
                          <Home className="w-3 h-3" />
                          View Other Listings
                        </Button>
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
                         <Button
                           size="sm"
                           className="gap-2 w-full"
                           style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                           onClick={() => setConvertContact(contact)}
                         >
                           <UserPlus className="w-3 h-3" />
                           Convert to Customer
                         </Button>
                         <Button
                           size="sm"
                           variant="outline"
                           className="gap-2 w-full"
                           style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#B8956A' }}
                           onClick={() => setDiscountContact(contact)}
                         >
                           <Tag className="w-3 h-3" />
                           Request Discount
                         </Button>
                        </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {contacts.length > 5 && (() => {
        const totalPages = Math.ceil(contacts.length / 5);
        const endIdx = contactsPage * 5 + visibleContactsOnPage;
        return (
          <div className="flex justify-center gap-2 pt-4 flex-wrap">
            {visibleContactsOnPage < 5 && endIdx < contacts.length && (
              <Button variant="outline" onClick={() => setVisibleContactsOnPage(v => Math.min(5, v + 5))} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Load More</Button>
            )}
            {totalPages > 1 && (
              <>
                <Button variant="outline" onClick={() => { setContactsPage(p => Math.max(0, p - 1)); setVisibleContactsOnPage(5); }} disabled={contactsPage === 0} style={{ borderColor: '#B8956A', color: '#B8956A' }}>← Back</Button>
                <span className="px-3 py-2 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Page {contactsPage + 1} of {totalPages}</span>
                <Button variant="outline" onClick={() => { setContactsPage(p => Math.min(totalPages - 1, p + 1)); setVisibleContactsOnPage(5); }} disabled={contactsPage === totalPages - 1} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Next →</Button>
              </>
            )}
          </div>
        );
      })()}

      {listingsContact && (
        <RealtorListingsPage
          realtor={{ name: listingsContact.name, brokerage: listingsContact.company || '' }}
          salesMemberId={salesMemberId}
          mode="fullPage"
          onClose={() => setListingsContact(null)}
        />
      )}

      {convertContact && (
        <ConvertToCustomerModal
          contact={{ email: convertContact.email, name: convertContact.name, company: convertContact.company, phone: convertContact.activities?.find(a => a.contact_phone)?.contact_phone || '' }}
          onClose={() => setConvertContact(null)}
          onConverted={() => { refetch(); }}
        />
      )}

      {discountContact && (
        <DiscountRequestModal
          contact={{ firstname: discountContact.name?.split(' ')[0] || '', lastname: discountContact.name?.split(' ').slice(1).join(' ') || '', email: discountContact.email, company: discountContact.company, id: '' }}
          onClose={() => setDiscountContact(null)}
        />
      )}
    </div>
  );
}