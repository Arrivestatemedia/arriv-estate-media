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
      const { data } = await base44.functions.invoke("searchHubSpotContacts", { query });
      // The function returns { contacts: [...] }
      const contactList = data?.contacts || [];
      setContacts(contactList);
      console.log("Contacts fetched:", contactList.length);
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
      const name = selectedContact.firstname || selectedContact.lastname 
        ? `${selectedContact.firstname || ''} ${selectedContact.lastname || ''}`.trim()
        : selectedContact.email;
      
      const contactCard = `[contact]${JSON.stringify({
        id: selectedContact.id,
        name,
        email: selectedContact.email,
        phone: selectedContact.phone,
        company: selectedContact.company
      })}`;

      await base44.entities.ChatMessage.create({
        channel_id: channelId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content: contactCard,
        timestamp: new Date().toISOString(),
        reactions: {}
      });

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
                placeholder="Search by name or email..."
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
                  {selectedContact.firstname || selectedContact.lastname 
                    ? `${selectedContact.firstname || ''} ${selectedContact.lastname || ''}`.trim()
                    : selectedContact.email}
                </h3>
                {selectedContact.email && (
                  <p className="text-sm text-gray-600">{selectedContact.email}</p>
                )}
                {selectedContact.company && (
                  <p className="text-xs text-gray-500">{selectedContact.company}</p>
                )}
                {selectedContact.phone && (
                  <p className="text-xs text-gray-500">{selectedContact.phone}</p>
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
                  className="flex-1 bg-[#B8956A] hover:bg-[#A68559]"
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
                    {contact.firstname || contact.lastname 
                      ? `${contact.firstname || ''} ${contact.lastname || ''}`.trim()
                      : contact.email}
                  </p>
                  {contact.email && (
                    <p className="text-xs text-gray-600">{contact.email}</p>
                  )}
                  {contact.company && (
                    <p className="text-xs text-gray-500">{contact.company}</p>
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