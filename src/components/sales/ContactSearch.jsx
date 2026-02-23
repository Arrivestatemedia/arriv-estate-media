import React, { useState } from "react";
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
import { Search, User, Building2, Mail, Phone, Loader2, ChevronDown, ChevronUp, Save, Check, Plus, X, Trash2 } from "lucide-react";

const FIELDS = [
  { key: "firstname", label: "First Name" },
  { key: "lastname", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "jobtitle", label: "Job Title" },
  { key: "hs_lead_status", label: "Lead Status" },
];

const NEW_CONTACT_DEFAULTS = { firstname: "", lastname: "", email: "", phone: "", company: "", jobtitle: "", hs_lead_status: "" };

export default function ContactSearch({ salesMemberId, openNewContactForm, setOpenNewContactForm }) {
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

  React.useEffect(() => {
    if (openNewContactForm) {
      setShowNewForm(true);
      setOpenNewContactForm(false);
    }
  }, [openNewContactForm, setOpenNewContactForm]);

  const handleDelete = async (contactId) => {
    setDeleting(true);
    try {
      await base44.functions.invoke("deleteHubSpotContact", {
        contactId,
        salesMemberId,
      });
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

  const toggleExpand = (contact) => {
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
    }
  };

  const handleSave = async (contactId) => {
    setSaving(true);
    try {
      // HubSpot expects properties in a flattened format (not wrapped in value objects)
      const propertiesToSend = {};
      Object.keys(editFields).forEach(key => {
        if (editFields[key] || editFields[key] === '') {
          propertiesToSend[key] = editFields[key];
        }
      });
      
      await base44.functions.invoke("updateHubSpotContact", {
        contactId,
        properties: propertiesToSend,
        salesMemberId,
      });
      setSavedId(contactId);
      setTimeout(() => setSavedId(null), 3000);
      // Refresh the result
      const updated = results.map(c =>
        c.id === contactId
          ? { ...c, firstname: editFields.firstname, lastname: editFields.lastname, email: editFields.email, phone: editFields.phone, company: editFields.company, jobtitle: editFields.jobtitle, lead_status: editFields.hs_lead_status }
          : c
      );
      setResults(updated);
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
      setTimeout(() => { setCreatedSuccess(false); setShowNewForm(false); }, 2500);
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
          onClick={() => { setShowNewForm(v => !v); setError(""); }}
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
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>{label}</label>
                  <Input
                    value={newContact[key] || ''}
                    onChange={(e) => setNewContact(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={label}
                  />
                </div>
              ))}
            </div>
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
                      {contact.lead_status && (
                        <Badge className="mt-1 text-xs" variant="outline">{contact.lead_status}</Badge>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 mt-1 shrink-0" /> : <ChevronDown className="w-4 h-4 mt-1 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Edit Contact</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {FIELDS.map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(26,26,26,0.7)' }}>{label}</label>
                          <Input
                            value={editFields[key] || ''}
                            onChange={(e) => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={label}
                          />
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