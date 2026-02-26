import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, User, Building2, Mail, Phone, Loader2, ChevronDown, ChevronUp, Save, Check, Plus, X, Trash2, Activity, Clock, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ActivityDetailModal from "@/components/sales/ActivityDetailModal";

const FIELDS = [
  { key: "firstname", label: "First Name" },
  { key: "lastname", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "jobtitle", label: "Job Title" },
  { key: "hs_lead_status", label: "Lead Status", type: "select", options: [
    { value: "NEW", label: "New" },
    { value: "OPEN", label: "Open" },
    { value: "IN_PROGRESS", label: "In Progress" },
    { value: "OPEN_DEAL", label: "Open Deal" },
    { value: "UNQUALIFIED", label: "Unqualified" },
    { value: "ATTEMPTED_TO_CONTACT", label: "Attempted to Contact" },
    { value: "CONNECTED", label: "Connected" },
    { value: "BAD_TIMING", label: "Bad Timing" },
  ]},
];

const NEW_CONTACT_DEFAULTS = { firstname: "", lastname: "", email: "", phone: "", company: "", jobtitle: "", hs_lead_status: "" };

// Fetches all activities for a contact by email or name
async function loadActivitiesForContact(contact) {
  const allActivities = await base44.entities.ActivityLog.list('-activity_date', 500);
  const fullName = `${contact.firstname || ''} ${contact.lastname || ''}`.trim().toLowerCase();
  return allActivities.filter(a => {
    if (contact.email && a.contact_email === contact.email) return true;
    if (fullName && a.contact_name && a.contact_name.toLowerCase() === fullName) return true;
    return false;
  }).sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
}

function ActivityList({ activities, loading, onSelect }) {
  if (loading) return (
    <div className="flex items-center justify-center py-3">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#B8956A' }} />
      <span className="ml-2 text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>Loading activities...</span>
    </div>
  );
  if (!activities) return null;

  // Separate past vs future for follow-up detection
  const now = new Date();
  const past = activities.filter(a => new Date(a.activity_date) <= now);
  const upcoming = activities.filter(a => new Date(a.activity_date) > now);

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4" style={{ color: '#B8956A' }} />
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>
          Activity History {activities.length > 0 ? `(${activities.length})` : ''}
        </p>
        {activities.length > 0 && <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>· Click any row for details</span>}
      </div>
      {activities.length === 0 ? (
        <p className="text-xs text-center py-2" style={{ color: 'rgba(26,26,26,0.6)' }}>No activities logged for this contact yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto bg-slate-50 rounded-lg p-2">
          {activities.map((activity, idx) => (
            <button
              key={idx}
              onClick={() => onSelect({ ...activity, _followUps: upcoming })}
              className="w-full text-left text-xs border-b border-slate-200 pb-2 last:border-b-0 hover:bg-white rounded px-2 py-1.5 transition-colors flex items-start justify-between gap-2 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-xs capitalize">{activity.activity_type}</Badge>
                  <span className="flex items-center gap-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
                    <Clock className="w-3 h-3" />
                    {new Date(activity.activity_date).toLocaleDateString()} {new Date(activity.activity_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {activity.notes && <p className="truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{activity.notes}</p>}
                {activity.sales_member_email && <p style={{ color: 'rgba(26,26,26,0.5)' }}>Rep: {activity.sales_member_email}</p>}
              </div>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#B8956A' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContactSearch({ salesMemberId, openNewContactForm, setOpenNewContactForm, prefilledData, onFormClosed }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newContact, setNewContact] = useState(NEW_CONTACT_DEFAULTS);
  const [creatingNew, setCreatingNew] = useState(false);
  const [createdSuccess, setCreatedSuccess] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [activities, setActivities] = useState({});
  const [loadingActivities, setLoadingActivities] = useState({});

  // Activities shown below the search box (for both regular search results and new contact auto-search)
  const [inlineActivities, setInlineActivities] = useState(null);
  const [inlineActivitiesLoading, setInlineActivitiesLoading] = useState(false);
  const [inlineContactInfo, setInlineContactInfo] = useState(null); // the matched contact

  const autoSearchTimer = useRef(null);

  // When prefilled data comes in (from contact card), open new form and auto-search
  useEffect(() => {
    if (openNewContactForm && prefilledData) {
      setShowNewForm(true);
      setOpenNewContactForm(false);
      const firstName = prefilledData.firstName || prefilledData.first_name || '';
      const lastName = prefilledData.lastName || prefilledData.last_name || '';
      const filled = {
        ...NEW_CONTACT_DEFAULTS,
        firstname: firstName,
        lastname: lastName,
        email: prefilledData.email || '',
        phone: prefilledData.phone || '',
        company: prefilledData.company || ''
      };
      setNewContact(filled);
      // Auto-search for this contact immediately
      const searchQ = `${firstName} ${lastName}`.trim() || prefilledData.email;
      if (searchQ) doInlineSearch(searchQ, filled);
    }
  }, [openNewContactForm, prefilledData]);

  // Auto-search HubSpot as user types in the New Contact form (debounced)
  useEffect(() => {
    if (!showNewForm) return;
    const searchQ = `${newContact.firstname} ${newContact.lastname}`.trim() || newContact.email;
    if (!searchQ || searchQ.length < 2) {
      setInlineActivities(null);
      setInlineContactInfo(null);
      return;
    }
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => {
      doInlineSearch(searchQ, newContact);
    }, 600);
    return () => clearTimeout(autoSearchTimer.current);
  }, [newContact.firstname, newContact.lastname, newContact.email, showNewForm]);

  const doInlineSearch = async (searchQ, contactFields) => {
    setInlineActivitiesLoading(true);
    setInlineActivities(null);
    setInlineContactInfo(null);
    try {
      const res = await base44.functions.invoke("searchHubSpotContacts", { query: searchQ });
      const contacts = res.data?.contacts || [];
      const match = contacts[0] || null;
      if (match) {
        setInlineContactInfo(match);
        const acts = await loadActivitiesForContact(match);
        setInlineActivities(acts);
      } else {
        // No HubSpot match — still try to pull activities by name/email from local DB
        const fakeContact = {
          email: contactFields?.email || '',
          firstname: contactFields?.firstname || '',
          lastname: contactFields?.lastname || ''
        };
        const acts = await loadActivitiesForContact(fakeContact);
        setInlineActivities(acts);
      }
    } catch (e) {
      console.error("Inline search failed:", e);
      setInlineActivities([]);
    } finally {
      setInlineActivitiesLoading(false);
    }
  };

  // When a regular search result is expanded, also load and show inline activities
  const fetchActivitiesForContact = async (contact) => {
    setLoadingActivities(prev => ({ ...prev, [contact.id]: true }));
    try {
      const acts = await loadActivitiesForContact(contact);
      setActivities(prev => ({ ...prev, [contact.id]: acts }));
    } catch (e) {
      console.error("Failed to fetch activities:", e);
    } finally {
      setLoadingActivities(prev => ({ ...prev, [contact.id]: false }));
    }
  };

  const handleDelete = async (contactId) => {
    setDeleting(true);
    try {
      await base44.functions.invoke("deleteHubSpotContact", { contactId, salesMemberId });
      setResults(results.filter(c => c.id !== contactId));
      setDeleteConfirmId(null);
    } catch (e) {
      setError("Delete failed: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError("");
    setResults([]);
    setExpandedId(null);
    setInlineActivities(null);
    setInlineContactInfo(null);
    try {
      const res = await base44.functions.invoke("searchHubSpotContacts", { query });
      setResults(res.data.contacts || []);
      if ((res.data.contacts || []).length === 0) setError("No contacts found.");
    } catch (e) {
      setError("Search failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (contact) => {
    if (expandedId === contact.id) {
      setExpandedId(null);
      setEditFields({});
    } else {
      setExpandedId(contact.id);
      setEditFields({
        firstname: contact.firstname,
        lastname: contact.lastname,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        jobtitle: contact.jobtitle,
        hs_lead_status: contact.lead_status,
      });
      if (!activities[contact.id]) {
        await fetchActivitiesForContact(contact);
      }
    }
  };

  const handleSave = async (contactId) => {
    setSaving(true);
    try {
      const propertiesToSend = {};
      Object.keys(editFields).forEach(key => {
        if (editFields[key] || editFields[key] === '') propertiesToSend[key] = editFields[key];
      });
      await base44.functions.invoke("updateHubSpotContact", { contactId, properties: propertiesToSend, salesMemberId });
      setSavedId(contactId);
      setTimeout(() => setSavedId(null), 3000);
      setResults(results.map(c =>
        c.id === contactId
          ? { ...c, firstname: editFields.firstname, lastname: editFields.lastname, email: editFields.email, phone: editFields.phone, company: editFields.company, jobtitle: editFields.jobtitle, lead_status: editFields.hs_lead_status }
          : c
      ));
    } catch (e) {
      setError("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newContact.firstname && !newContact.lastname && !newContact.email) {
      setError("Please provide at least a name or email.");
      return;
    }
    setCreatingNew(true);
    setError("");
    try {
      await base44.functions.invoke("updateHubSpotContact", {
        contactId: null,
        properties: newContact,
        salesMemberId,
        createIfNotFound: true,
      });
      setCreatedSuccess(true);
      setNewContact(NEW_CONTACT_DEFAULTS);
      setTimeout(() => {
        setCreatedSuccess(false);
        setShowNewForm(false);
        setInlineActivities(null);
        setInlineContactInfo(null);
        if (onFormClosed) onFormClosed();
      }, 2500);
    } catch (e) {
      setError("Failed to create contact: " + e.message);
    } finally {
      setCreatingNew(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: '#1A1A1A' }}>Search Contacts</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Find a contact by name, email, or phone and update their info.</p>
        </div>
        <Button
          onClick={() => {
            setShowNewForm(v => !v);
            setError("");
            if (showNewForm) {
              setInlineActivities(null);
              setInlineContactInfo(null);
            }
          }}
          variant="outline"
          className="gap-2 shrink-0"
          style={{ borderColor: '#B8956A', color: '#B8956A' }}
        >
          {showNewForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showNewForm ? "Cancel" : "New Contact"}
        </Button>
      </div>

      {/* New Contact Form */}
      {showNewForm && (
        <Card style={{ borderColor: '#B8956A' }}>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Create New Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map(({ key, label, type, options }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>{label}</label>
                  {type === "select" ? (
                    <Select value={newContact[key] || ''} onValueChange={(value) => setNewContact(prev => ({ ...prev, [key]: value }))}>
                      <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
                      <SelectContent>
                        {options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={newContact[key] || ''}
                      onChange={(e) => setNewContact(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={label}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Matched HubSpot contact info */}
            {inlineContactInfo && (
              <div className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-200">
                <span className="font-semibold text-amber-700">HubSpot match found: </span>
                <span style={{ color: '#1A1A1A' }}>
                  {[inlineContactInfo.firstname, inlineContactInfo.lastname].filter(Boolean).join(' ')}
                  {inlineContactInfo.email ? ` · ${inlineContactInfo.email}` : ''}
                  {inlineContactInfo.company ? ` · ${inlineContactInfo.company}` : ''}
                </span>
              </div>
            )}

            {/* Activity history for matched contact */}
            <ActivityList activities={inlineActivities} loading={inlineActivitiesLoading} />

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              onClick={handleCreateNew}
              disabled={creatingNew}
              className="gap-2"
              style={{ backgroundColor: createdSuccess ? '#22c55e' : '#B8956A', color: '#fff' }}
            >
              {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : createdSuccess ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {createdSuccess ? 'Contact Created!' : 'Create Contact'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Regular Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Search by name, email, or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1"
        />
        <Button
          onClick={handleSearch}
          disabled={loading || query.trim().length < 2}
          style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {!showNewForm && error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {results.map((contact) => {
          const isExpanded = expandedId === contact.id;
          const isSaved = savedId === contact.id;
          return (
            <Card key={contact.id} style={{ borderColor: isExpanded ? '#B8956A' : 'rgba(184,149,106,0.2)' }}>
              <CardContent className="pt-4 pb-4">
                <button
                  onClick={() => toggleExpand(contact)}
                  className="w-full text-left flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.1)' }}>
                      <User className="w-4 h-4" style={{ color: '#B8956A' }} />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: '#1A1A1A' }}>
                        {[contact.firstname, contact.lastname].filter(Boolean).join(' ') || 'Unknown'}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                        {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                        {contact.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{contact.company}</span>}
                      </div>
                      {contact.lead_status && <Badge className="mt-1 text-xs" variant="outline">{contact.lead_status}</Badge>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-4" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                    {/* Activity History */}
                    <ActivityList activities={activities[contact.id]} loading={loadingActivities[contact.id]} />

                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Edit Contact</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {FIELDS.map(({ key, label, type, options }) => (
                        <div key={key}>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>{label}</label>
                          {type === "select" ? (
                            <Select value={editFields[key] || ''} onValueChange={(value) => setEditFields(prev => ({ ...prev, [key]: value }))}>
                              <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
                              <SelectContent>
                                {options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={editFields[key] || ''}
                              onChange={(e) => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={label}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSave(contact.id)}
                        disabled={saving}
                        className="gap-2 flex-1"
                        style={{ backgroundColor: isSaved ? '#22c55e' : '#B8956A', color: '#fff' }}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {isSaved ? 'Saved!' : 'Save Changes'}
                      </Button>
                      <Button
                        onClick={() => setDeleteConfirmId(contact.id)}
                        variant="outline"
                        className="gap-2"
                        style={{ borderColor: '#dc2626', color: '#dc2626' }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteConfirmId)}
              disabled={deleting}
              style={{ backgroundColor: '#dc2626' }}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}