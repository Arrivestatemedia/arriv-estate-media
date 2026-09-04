import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Search, Users, UserCheck } from "lucide-react";
import { toast } from "sonner";

export default function ContactReassignment() {
  const queryClient = useQueryClient();
  const [sourceRepId, setSourceRepId] = useState("");
  const [targetRepId, setTargetRepId] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [reassigning, setReassigning] = useState(false);

  // Load all sales team members (reps)
  const { data: reps = [], isLoading: repsLoading } = useQuery({
    queryKey: ['salesTeamMembers'],
    queryFn: () => base44.entities.SalesTeamMember.list(),
  });

  const activeReps = useMemo(
    () => reps.filter(r => r.is_active !== false).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")),
    [reps]
  );

  const repById = useMemo(() => {
    const map = {};
    reps.forEach(r => { map[r.id] = r; });
    return map;
  }, [reps]);

  // Load contacts based on source filter
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['reassignContacts', sourceRepId],
    queryFn: async () => {
      if (sourceRepId === "unassigned") {
        return base44.entities.Contact.filter({ sales_member_id: { $exists: false } }, '-created_date', 500);
      }
      if (sourceRepId) {
        return base44.entities.Contact.filter({ sales_member_id: sourceRepId }, '-created_date', 500);
      }
      return base44.entities.Contact.list('-created_date', 500);
    },
  });

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      (c.firstname || "").toLowerCase().includes(q) ||
      (c.lastname || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const repName = (id) => {
    if (!id) return "Unassigned";
    const r = repById[id];
    return r ? r.full_name : "Unknown";
  };

  const handleReassign = async () => {
    if (!targetRepId) {
      toast.error("Select a target rep first");
      return;
    }
    if (selectedIds.size === 0) {
      toast.error("Select at least one contact to reassign");
      return;
    }
    const targetRep = repById[targetRepId];
    if (!targetRep) {
      toast.error("Target rep not found");
      return;
    }

    setReassigning(true);
    try {
      const ids = Array.from(selectedIds);
      await base44.entities.Contact.bulkUpdate(
        ids.map(id => ({ id, sales_member_id: targetRepId }))
      );
      toast.success(`Reassigned ${ids.length} contact${ids.length > 1 ? 's' : ''} to ${targetRep.full_name}`);
      setSelectedIds(new Set());
      setTargetRepId("");
      queryClient.invalidateQueries({ queryKey: ['reassignContacts'] });
      queryClient.invalidateQueries({ queryKey: ['salesTeamMembers'] });
    } catch (err) {
      console.error(err);
      toast.error("Failed to reassign contacts");
    } finally {
      setReassigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>Contact Reassignment</h1>
        <p className="mt-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
          Move contacts between sales reps or assign unassigned contacts.
        </p>
      </div>

      {/* Source / Target selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card style={{ backgroundColor: '#FFFFFF' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <Search className="w-4 h-4" style={{ color: '#B8956A' }} /> Source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={sourceRepId}
              onChange={(e) => { setSourceRepId(e.target.value); setSelectedIds(new Set()); }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'rgba(184,149,106,0.3)', backgroundColor: '#FFFBF5' }}
            >
              <option value="">All Contacts</option>
              <option value="unassigned">Unassigned Only</option>
              {activeReps.map(rep => (
                <option key={rep.id} value={rep.id}>{rep.full_name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'rgba(184,149,106,0.3)', backgroundColor: '#FFFBF5' }}
            />
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: '#FFFFFF' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <ArrowRight className="w-4 h-4" style={{ color: '#B8956A' }} /> Assign To
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={targetRepId}
              onChange={(e) => setTargetRepId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'rgba(184,149,106,0.3)', backgroundColor: '#FFFBF5' }}
            >
              <option value="">Select target rep...</option>
              {activeReps.map(rep => (
                <option key={rep.id} value={rep.id}>{rep.full_name}</option>
              ))}
            </select>
            <Button
              onClick={handleReassign}
              disabled={reassigning || selectedIds.size === 0 || !targetRepId}
              className="w-full"
              style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
            >
              {reassigning ? "Reassigning..." : `Reassign ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Contact list */}
      <Card style={{ backgroundColor: '#FFFFFF' }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <Users className="w-4 h-4" style={{ color: '#B8956A' }} />
              {contactsLoading ? "Loading..." : `${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''}`}
              {selectedIds.size > 0 && (
                <Badge variant="secondary" className="ml-2 gap-1">
                  <UserCheck className="w-3 h-3" /> {selectedIds.size} selected
                </Badge>
              )}
            </CardTitle>
            {filteredContacts.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleSelectAll} style={{ color: '#B8956A' }}>
                {selectedIds.size === filteredContacts.length ? "Deselect All" : "Select All"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {contactsLoading ? (
            <p className="text-sm py-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>Loading contacts...</p>
          ) : filteredContacts.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>No contacts found.</p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {filteredContacts.map(contact => {
                const selected = selectedIds.has(contact.id);
                return (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer hover:bg-[#FFFBF5]"
                    style={{
                      borderColor: selected ? '#B8956A' : 'rgba(184,149,106,0.15)',
                      backgroundColor: selected ? 'rgba(184,149,106,0.08)' : 'transparent',
                    }}
                    onClick={() => toggleSelect(contact.id)}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>
                        {contact.firstname} {contact.lastname}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>
                        {contact.email}{contact.company ? ` · ${contact.company}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs"
                      style={{ borderColor: 'rgba(184,149,106,0.3)', color: '#B8956A' }}
                    >
                      {repName(contact.sales_member_id)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}