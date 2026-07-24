import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Check, X, Mail, Phone } from "lucide-react";

const STATUS_META = {
  not_started: { label: "Not Started", variant: "secondary" },
  pending: { label: "Pending", variant: "outline" },
  clear: { label: "Cleared", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

export default function AdminBackgroundChecks() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    if (userRole !== 'admin') {
      window.location.href = "/";
    } else {
      setUser({ role: userRole });
    }
  }, []);

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const partners = allUsers.filter((u) => u.user_type === "media_partner" && u.background_check_status);

  const markMutation = useMutation({
    mutationFn: ({ email, status }) => base44.functions.invoke('updateBackgroundCheckStatus', { email, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-users"] }),
  });

  if (!user || user?.role !== "admin") return null;

  const sorted = [...partners].sort((a, b) => {
    const order = { pending: 0, failed: 1, not_started: 2, clear: 3 };
    return (order[a.background_check_status] ?? 9) - (order[b.background_check_status] ?? 9);
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-[#B8956A]" /> Background Checks
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Invite candidates in the Checkr Dashboard (Candidates → Invite candidate), then record the result here. Marking a partner Failed removes them from their gig and promotes the backup.
          </p>
        </div>

        <Card className="border-[var(--border-color)]">
          <CardHeader>
            <CardTitle>Media Partners ({partners.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-[var(--text-secondary)]">Loading…</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-secondary)]">
                No media partners have started a background check yet.
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map((p) => {
                  const meta = STATUS_META[p.background_check_status] || STATUS_META.not_started;
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[var(--border-color)] rounded-lg p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[var(--text-primary)]">{p.full_name}</span>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {p.email}</span>
                          {p.phone_number && (
                            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {p.phone_number}</span>
                          )}
                        </div>
                        {p.background_check_authorized_at && (
                          <div className="text-xs text-[var(--text-secondary)]">
                            Authorized {new Date(p.background_check_authorized_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          disabled={markMutation.isPending || p.background_check_status === "clear"}
                          onClick={() => markMutation.mutate({ email: p.email, status: "clear" })}
                        >
                          <Check className="w-4 h-4 mr-1" /> Mark Clear
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={markMutation.isPending || p.background_check_status === "failed"}
                          onClick={() => {
                            if (confirm(`Mark ${p.full_name} as failed? This removes them from their gig and promotes/notifies the backup.`)) {
                              markMutation.mutate({ email: p.email, status: "failed" });
                            }
                          }}
                        >
                          <X className="w-4 h-4 mr-1" /> Mark Failed
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}