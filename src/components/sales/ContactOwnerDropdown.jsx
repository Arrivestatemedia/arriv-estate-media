import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

/**
 * Shows the current contact owner and lets an admin reassign to another
 * active sales team member via a dropdown. Only renders for admin users.
 *
 * Props:
 *   contactId      — Contact entity ID (required to update)
 *   salesMemberId  — current sales_member_id on the contact
 */
export default function ContactOwnerDropdown({ contactId, salesMemberId }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: reps = [] } = useQuery({
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

  if (!contactId) return null;

  const currentName = salesMemberId ? (repById[salesMemberId]?.full_name || "Unknown") : "Unassigned";

  const handleChange = async (newRepId) => {
    if (newRepId === salesMemberId) return;
    setSaving(true);
    try {
      await base44.entities.Contact.update(contactId, { sales_member_id: newRepId });
      toast.success(`Contact reassigned to ${repById[newRepId]?.full_name || 'new owner'}`);
      queryClient.invalidateQueries({ queryKey: ['salesTeamMembers'] });
      queryClient.invalidateQueries();
    } catch (err) {
      console.error(err);
      toast.error("Failed to reassign contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <UserCog className="w-4 h-4 shrink-0" style={{ color: '#B8956A' }} />
      <span className="text-xs whitespace-nowrap" style={{ color: 'rgba(26,26,26,0.5)' }}>Owner:</span>
      <Select
        value={salesMemberId || "unassigned"}
        onValueChange={handleChange}
        disabled={saving}
      >
        <SelectTrigger
          className="h-8 text-xs font-medium border-[#B8956A]/30 bg-[#FFFBF5] hover:border-[#B8956A]"
          style={{ minWidth: '160px', color: '#1A1A1A' }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {activeReps.map(rep => (
            <SelectItem key={rep.id} value={rep.id}>{rep.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <span className="text-xs" style={{ color: '#B8956A' }}>Saving…</span>}
    </div>
  );
}