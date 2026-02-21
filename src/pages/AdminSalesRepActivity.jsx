import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Calendar, X } from "lucide-react";
import { format } from "date-fns";

export default function AdminSalesRepActivity() {
  const [user, setUser] = useState(null);
  const [selectedRep, setSelectedRep] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

  useEffect(() => {
    base44.auth.me().then((authUser) => {
      if (authUser?.role === 'admin') {
        setUser(authUser);
      } else {
        window.location.href = '/';
      }
    });
  }, []);

  const { data: salesMembers = [] } = useQuery({
    queryKey: ['salesMembers'],
    queryFn: () => base44.entities.SalesTeamMember.list(),
    enabled: !!user
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => base44.entities.ActivityLog.list('-activity_date', 500),
    enabled: !!user
  });

  const activityIcons = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />
  };

  const activityLabels = {
    call: "Call",
    email: "Email",
    meeting: "Meeting"
  };

  const getActivitiesByRep = (repEmail) => {
    return activities.filter(a => a.created_by === repEmail).sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));
  };

  const getRepStats = (repEmail) => {
    const repActivities = getActivitiesByRep(repEmail);
    return {
      total: repActivities.length,
      calls: repActivities.filter(a => a.activity_type === 'call').length,
      emails: repActivities.filter(a => a.activity_type === 'email').length,
      meetings: repActivities.filter(a => a.activity_type === 'meeting').length
    };
  };

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8" style={{ color: '#1A1A1A' }}>Sales Rep Activity</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Reps List */}
          <div>
            <h2 className="text-lg font-semibold mb-4" style={{ color: '#1A1A1A' }}>Sales Team</h2>
            <div className="space-y-2">
              {salesMembers.filter(rep => rep.is_active).map((rep) => {
                const stats = getRepStats(rep.email);
                const isSelected = selectedRep?.email === rep.email;
                return (
                  <button
                    key={rep.id}
                    onClick={() => setSelectedRep(rep)}
                    className="w-full text-left p-4 rounded-lg border-2 transition"
                    style={{
                      backgroundColor: isSelected ? 'rgba(184, 149, 106, 0.1)' : '#FFFFFF',
                      borderColor: isSelected ? '#B8956A' : 'rgba(184, 149, 106, 0.2)'
                    }}
                  >
                    <p className="font-medium" style={{ color: '#1A1A1A' }}>{rep.full_name}</p>
                    <p className="text-sm mb-2" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{rep.email}</p>
                    <div className="flex gap-2 text-xs">
                      <Badge variant="outline">{stats.total} total</Badge>
                      <Badge variant="outline">{stats.calls} calls</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity Details */}
          <div className="lg:col-span-2">
            {selectedRep ? (
              <div>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold mb-2" style={{ color: '#1A1A1A' }}>{selectedRep.full_name}</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const stats = getRepStats(selectedRep.email);
                      return [
                        { label: 'Total Activities', value: stats.total },
                        { label: 'Calls', value: stats.calls },
                        { label: 'Emails', value: stats.emails },
                        { label: 'Meetings', value: stats.meetings }
                      ].map((stat) => (
                        <Card key={stat.label}>
                          <CardContent className="pt-6">
                            <p className="text-2xl font-bold" style={{ color: '#B8956A' }}>{stat.value}</p>
                            <p className="text-xs" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{stat.label}</p>
                          </CardContent>
                        </Card>
                      ));
                    })()}
                  </div>
                </div>

                <h3 className="text-lg font-semibold mb-4" style={{ color: '#1A1A1A' }}>Recent Activity</h3>
                <div className="space-y-3">
                  {getActivitiesByRep(selectedRep.email).slice(0, 10).map((activity) => (
                    <button
                      key={activity.id}
                      onClick={() => setSelectedActivity(activity)}
                      className="w-full text-left hover:shadow-md transition"
                    >
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)' }}>
                              {activityIcons[activity.activity_type]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                                <span className="text-xs" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                                  {format(new Date(activity.activity_date), "MMM d, h:mm a")}
                                </span>
                              </div>
                              <p className="font-medium" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                              {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                              <p className="text-sm mt-2 line-clamp-2" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                  Select a sales rep to view their activity
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Activity Detail Modal */}
        <Dialog open={!!selectedActivity} onOpenChange={() => setSelectedActivity(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle style={{ color: '#1A1A1A' }}>
                {selectedActivity && activityLabels[selectedActivity.activity_type]} Details
              </DialogTitle>
            </DialogHeader>
            {selectedActivity && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Type</p>
                    <p className="text-lg font-medium mt-1" style={{ color: '#1A1A1A' }}>
                      {activityLabels[selectedActivity.activity_type]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Date & Time</p>
                    <p className="text-lg font-medium mt-1" style={{ color: '#1A1A1A' }}>
                      {format(new Date(selectedActivity.activity_date), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Contact</p>
                  <p className="text-lg font-medium mt-1" style={{ color: '#1A1A1A' }}>
                    {selectedActivity.contact_name}
                  </p>
                  {selectedActivity.contact_email && (
                    <p className="text-sm mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                      {selectedActivity.contact_email}
                    </p>
                  )}
                </div>

                {selectedActivity.company_name && (
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Company</p>
                    <p className="text-lg font-medium mt-1" style={{ color: '#1A1A1A' }}>
                      {selectedActivity.company_name}
                    </p>
                  </div>
                )}

                {selectedActivity.duration_minutes > 0 && (
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Duration</p>
                    <p className="text-lg font-medium mt-1" style={{ color: '#1A1A1A' }}>
                      {selectedActivity.duration_minutes} minutes
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Notes</p>
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: '#1A1A1A' }}>
                    {selectedActivity.notes}
                  </p>
                </div>

                {selectedActivity.hubspot_synced && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                    <p className="text-sm font-medium" style={{ color: '#22c55e' }}>✓ Synced to HubSpot</p>
                  </div>
                )}
                {selectedActivity.sync_error && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                    <p className="text-sm font-medium" style={{ color: '#ef4444' }}>⚠ Sync Error</p>
                    <p className="text-sm mt-1" style={{ color: 'rgba(239, 68, 68, 0.8)' }}>{selectedActivity.sync_error}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}