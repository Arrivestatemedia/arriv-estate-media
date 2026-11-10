import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Loader2, Trash2, RotateCcw, Mail } from "lucide-react";
import {
  loadOrganizationMembers,
  inviteOrganizationMember,
  updateOrganizationMemberRole,
  setOrganizationMemberStatus,
} from "@/lib/purchasingContext";

const ROLE_LABELS = {
  admin: "Administrator",
  full: "Full access",
  booking_only: "Booking only",
};

/**
 * Company team management for an organization administrator.
 * Everything is enforced server-side by the session and the caller's company role;
 * this screen simply reflects it. Members only ever see their own membership.
 */
export default function B2BCompanyMembers({ organizationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState({ email: "", name: "", role: "full" });
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await loadOrganizationMembers(organizationId);
      setData(res);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (organizationId) load();
  }, [organizationId]);

  const handleInvite = async () => {
    setError("");
    setNotice("");
    if (!invite.email.includes("@")) {
      setError("Enter the email address they use with Arriv.");
      return;
    }
    setInviting(true);
    try {
      await inviteOrganizationMember({
        organizationId,
        email: invite.email.trim(),
        name: invite.name.trim(),
        role: invite.role,
      });
      setInvite({ email: "", name: "", role: "full" });
      setNotice("Invitation created. They join with their existing login on their next sign-in.");
      await load();
    } catch (e) {
      setError(e.message);
    }
    setInviting(false);
  };

  const handleRole = async (member, role) => {
    setBusyId(member.id);
    setError("");
    try {
      await updateOrganizationMemberRole({ organizationId, memberId: member.id, role });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId("");
  };

  const handleRemove = async (member, remove) => {
    setBusyId(member.id);
    setError("");
    try {
      await setOrganizationMemberStatus({ organizationId, memberId: member.id, remove });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId("");
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />
        Loading your company team…
      </div>
    );
  }

  if (!data?.is_admin) return null;

  const members = data.members || [];

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-[var(--card-bg)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#B8956A]/20 flex items-center gap-2">
        <Users className="w-4 h-4 text-[#B8956A]" />
        <h2 className="font-semibold text-[var(--text-primary)]">Company team</h2>
      </div>

      <div className="divide-y divide-[#B8956A]/10">
        {members.map((member) => (
          <div key={member.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="font-medium text-[var(--text-primary)]">
                {member.name || member.email}
                {member.is_me && <span className="ml-2 text-xs text-[#B8956A]">You</span>}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{member.email}</p>
            </div>

            <select
              value={member.role}
              disabled={busyId === member.id}
              onChange={(e) => handleRole(member, e.target.value)}
              className="text-sm rounded-md border border-[#B8956A]/30 bg-transparent px-2 py-1 text-[var(--text-primary)]"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <span
              className={`text-xs px-2 py-1 rounded ${
                member.status === "active"
                  ? "bg-[#B8956A]/15 text-[#B8956A]"
                  : "bg-[var(--border-color)] text-[var(--text-secondary)]"
              }`}
            >
              {member.status === "active" ? "Active" : member.status === "invited" ? "Invited" : "Removed"}
            </span>

            {member.status === "deactivated" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === member.id}
                onClick={() => handleRemove(member, false)}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={busyId === member.id}
                onClick={() => handleRemove(member, true)}
                title="Remove company access"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-4 border-t border-[#B8956A]/20 space-y-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">Add someone from your team</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              placeholder="agent@brokerage.com"
            />
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={invite.name}
              onChange={(e) => setInvite({ ...invite, name: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <select
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              className="w-full h-9 text-sm rounded-md border border-input bg-transparent px-3 text-[var(--text-primary)]"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={handleInvite}
          disabled={inviting}
          className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]"
        >
          {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
          Send invitation
        </Button>

        {notice && <p className="text-sm text-[var(--text-secondary)]">{notice}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-[var(--text-secondary)]">
          Removing someone ends their company access immediately. Their own account, bookings and delivered media are
          kept.
        </p>
      </div>
    </section>
  );
}