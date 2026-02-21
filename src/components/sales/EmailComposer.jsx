import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Loader2 } from "lucide-react";

export default function EmailComposer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    to: "",
    subject: "",
    body: ""
  });

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const result = await base44.functions.invoke('searchHubSpotContacts', { query });
      setSearchResults(result.data?.contacts || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setFormData({
      ...formData,
      to: contact.email
    });
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSendEmail = async () => {
    if (!formData.to || !formData.subject || !formData.body) {
      alert("Please fill in all fields");
      return;
    }

    setSending(true);
    try {
      await base44.functions.invoke('sendEmailViaGmail', {
        ...formData,
        contactEmail: selectedContact?.email
      });
      alert("Email sent successfully!");
      setFormData({ to: "", subject: "", body: "" });
      setSelectedContact(null);
    } catch (error) {
      alert("Failed to send email: " + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-3" style={{ color: '#1A1A1A' }}>Search Contacts in HubSpot</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4" style={{ color: '#B8956A' }} />
          <Input
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-10"
          />
          {loading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin" style={{ color: '#B8956A' }} />}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searchResults.map((contact) => (
              <button
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0 transition"
              >
                <p className="font-medium" style={{ color: '#1A1A1A' }}>
                  {contact.firstname} {contact.lastname}
                </p>
                <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{contact.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedContact && (
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.1)', borderLeft: '3px solid #B8956A' }}>
          <p className="text-sm" style={{ color: '#1A1A1A' }}>
            <span className="font-medium">Selected:</span> {selectedContact.firstname} {selectedContact.lastname}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>To</label>
        <Input
          type="email"
          placeholder="recipient@example.com"
          value={formData.to}
          onChange={(e) => setFormData({ ...formData, to: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Subject</label>
        <Input
          placeholder="Email subject..."
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Message</label>
        <Textarea
          placeholder="Your message..."
          value={formData.body}
          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
          rows={8}
        />
      </div>

      <Button
        onClick={handleSendEmail}
        disabled={sending}
        className="w-full gap-2"
        style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
      >
        <Send className="w-4 h-4" />
        {sending ? "Sending..." : "Send Email"}
      </Button>
    </div>
  );
}