import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function ChatContactCard({ channelId, currentUserId, currentUserName, onContactAdded, chatType = "channel" }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);

  const searchContacts = async (query) => {
    if (!query.trim()) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const results = await base44.functions.invoke("searchHubSpotContacts", { query });
      setContacts(results.contacts || []);
    } catch (err) {
      console.error("Error searching contacts:", err);
      toast.error("Failed to search contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 1) {
      searchContacts(query);
    } else {
      setContacts([]);
    }
  };

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
  };

  const handleSendContact = async () => {
    if (!selectedContact) return;

    try {
      const contactCard = `[contact]${JSON.stringify({
        id: selectedContact.id,
        name: selectedContact.properties?.firstname ? `${selectedContact.properties.firstname} ${selectedContact.properties.lastname || ''}`.trim() : selectedContact.properties?.email,
        email: selectedContact.properties?.email,
        phone: selectedContact.properties?.phone,
        company: selectedContact.properties?.company,
        hubspot_url: `https://app.hubspot.com/contacts/20827947/contact/${selectedContact.id}`
      })}`;

      if (chatType === "channel") {
        await base44.entities.ChatMessage.create({
          channel_id: channelId,
          sender_id: currentUserId,
          sender_name: currentUserName,
          content: contactCard,
          timestamp: new Date().toISOString(),
          reactions: {}
        });
      }

      toast.success("Contact shared!");
      setSelectedContact(null);
      setSearchQuery("");
      setContacts([]);
      setSearchOpen(false);
      onContactAdded?.();
    } catch (err) {
      console.error("Error sending contact:", err);
      toast.error("Failed to share contact");
    }
  };

  return (
    <div className="relative">
      {!searchOpen ? (
        <button
          onClick={() => setSearchOpen(true)}
          className="text-gray-400 hover:text-[#B8956A] transition-colors p-1 flex-shrink-0"
          title="Share contact"
        >
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSearchOpen(false)} />
      )}

      {searchOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg w-80 z-50">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={handleSearch}
                className="flex-1"
                autoFocus
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedContact ? (
            <div className="p-4">
              <div className="mb-3 pb-3 border-b">
                <h3 className="font-semibold text-gray-900">
                  {selectedContact.properties?.firstname ? `${selectedContact.properties.firstname} ${selectedContact.properties.lastname || ''}`.trim() : selectedContact.properties?.email}
                </h3>
                {selectedContact.properties?.email && (
                  <p className="text-sm text-gray-600">{selectedContact.properties.email}</p>
                )}
                {selectedContact.properties?.company && (
                  <p className="text-xs text-gray-500">{selectedContact.properties.company}</p>
                )}
                {selectedContact.properties?.phone && (
                  <p className="text-xs text-gray-500">{selectedContact.properties.phone}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedContact(null)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-[#B8956A] hover:bg-[#A68559] gap-1"
                  onClick={handleSendContact}
                >
                  <Send className="w-3 h-3" />
                  Share
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 max-h-64 overflow-y-auto">
              {loading && (
                <p className="text-sm text-gray-500 text-center py-4">Searching...</p>
              )}
              {!loading && contacts.length === 0 && searchQuery && (
                <p className="text-sm text-gray-500 text-center py-4">No contacts found</p>
              )}
              {!loading && contacts.length === 0 && !searchQuery && (
                <p className="text-sm text-gray-500 text-center py-4">Type to search contacts</p>
              )}
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleSelectContact(contact)}
                  className="w-full text-left p-2 hover:bg-gray-100 rounded transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {contact.properties?.firstname ? `${contact.properties.firstname} ${contact.properties.lastname || ''}`.trim() : contact.properties?.email}
                  </p>
                  {contact.properties?.email && (
                    <p className="text-xs text-gray-600">{contact.properties.email}</p>
                  )}
                  {contact.properties?.company && (
                    <p className="text-xs text-gray-500">{contact.properties.company}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}