import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Calendar, Clock, Zap, Archive, MapPin, Brain, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import ActivityArchive from "@/components/sales/ActivityArchive";
import ViewCallMapModal from "@/components/sales/ViewCallMapModal";

const activityIcons = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  task: <Clock className="w-4 h-4" />,
  note: <Zap className="w-4 h-4" />,
};

const activityLabels = {
  call: "Call", email: "Email", meeting: "Meeting", task: "Task", note: "Note"
};

export default function AdminActivityLogView({ salesMemberId, salesMemberEmail, repName, isAdminView }) {
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [showArchive, setShowArchive] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [viewMapActivity, setViewMapActivity] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const queryClient = useQueryClient();

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await base44.functions.invoke('backfillCallMapLearning', {});
      setBackfillResult(res.data?.message || 'Done');
    } catch (e) {
      setBackfillResult('Error: ' + e.message);
    } finally {
      setBackfilling(false);
    }
  };

  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  const runSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await base44.functions.invoke('seedStyleFromExamples', {});
      setSeedResult(res.data?.message || 'Done');
    } catch (e) {
      setSeedResult('Error: ' + e.message);
    } finally {
      setSeeding(false);
    }
  };

  const { data: activities = [] } = useQuery({
    queryKey: ['adminRepActivities', salesMemberId],
    queryFn: () => base44.entities.ActivityLog.filter({ sales_member_id: salesMemberId }, '-activity_date', 200),
    enabled: !!salesMemberId,
    refetchInterval: 15000,
  });

  // Subscribe to ActivityLog changes to pick up new call_map data
  useEffect(() => {
    if (!salesMemberId) return;
    
    let unsubscribe = () => {};
    try {
      unsubscribe = base44.entities.ActivityLog.subscribe((event) => {
        if (event.data?.sales_member_id === salesMemberId && event.data?.call_map) {
          queryClient.invalidateQueries({ queryKey: ['adminRepActivities', salesMemberId] });
        }
      });
    } catch (e) {
      console.error('[AdminActivityLogView] ActivityLog subscribe failed:', e);
    }
    
    return unsubscribe;
  }, [salesMemberId, queryClient]);

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .slice(0, 5);

  const pastActivities = [...activities]
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.created_date || b.activity_date) - new Date(a.created_date || a.activity_date));

  if (showArchive) {
    return (
      <ActivityArchive
        salesMemberId={salesMemberId}
        salesMemberEmail={salesMemberEmail}
        onClose={() => setShowArchive(false)}
      />
    );
  }

  return (
    <div>
      {/* AI Learning backfill — admin only */}
      {isAdminView && (
        <div className="mb-5 rounded-xl" style={{ backgroundColor: 'rgba(184,149,106,0.07)', border: '1px solid rgba(184,149,106,0.2)' }}>
          <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" style={{ color: '#B8956A' }} />
              <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>AI Call Map Learning</span>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button size="sm" onClick={runSeed} disabled={seeding} style={{ backgroundColor: '#1A1A1A', color: '#fff' }} className="gap-2">
                <Brain className={`w-3.5 h-3.5 ${seeding ? 'animate-pulse' : ''}`} />
                {seeding ? 'Seeding...' : "Seed from Brad's Examples"}
              </Button>
              <Button size="sm" onClick={runBackfill} disabled={backfilling} style={{ backgroundColor: '#B8956A', color: '#fff' }} className="gap-2">
                <Brain className={`w-3.5 h-3.5 ${backfilling ? 'animate-pulse' : ''}`} />
                {backfilling ? 'Learning...' : 'Learn from All Call Maps'}
              </Button>
            </div>
          </div>
          {(seedResult || backfillResult) ? (
            <p className="px-3 pb-2 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{seedResult || backfillResult}</p>
          ) : null}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: activities.length },
          { label: 'Calls', value: activities.filter(a => a.activity_type === 'call').length },
          { label: 'Upcoming Tasks', value: upcomingActivities.length },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#B8956A' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upcoming Tasks */}
      {upcomingActivities.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
            <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
            <Badge variant="secondary">{upcomingActivities.length}</Badge>
          </div>
          <div className="space-y-3">
            {upcomingActivities.map((activity) => (
              <div key={activity.id}>
                <Card
                  style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184,149,106,0.08)' }}
                  className="cursor-pointer hover:shadow-md transition"
                  onClick={() => setSelectedActivity(activity)}
                >
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.2)' }}>
                        {activityIcons[activity.activity_type]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A' }}>
                            {activityLabels[activity.activity_type]}
                          </Badge>
                          <Clock className="w-4 h-4" style={{ color: '#B8956A' }} />
                          <span className="text-sm font-medium" style={{ color: '#B8956A' }}>
                            {format(new Date(activity.activity_date), "MMM d 'at' h:mm a")}
                          </span>
                          {activity.call_map && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs gap-1 ml-auto"
                              style={{ color: '#B8956A' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewMapActivity(activity);
                              }}
                            >
                              <MapPin className="w-3 h-3" />
                              View Call Map
                            </Button>
                          )}
                        </div>
                        <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                        {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                        <p className="text-sm mt-1" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {activity.call_map && (
                  <ViewCallMapModal
                    activity={activity}
                    open={viewMapActivity?.id === activity.id}
                    onOpenChange={(open) => !open && setViewMapActivity(null)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity History */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4" style={{ color: '#1A1A1A' }}>Activity History</h2>
        <div className="space-y-3">
          {pastActivities.length === 0 && upcomingActivities.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center" style={{ color: 'rgba(26,26,26,0.6)' }}>
                No activities logged yet
              </CardContent>
            </Card>
          ) : (
            <>
              {pastActivities.slice(0, visibleCount).map((activity) => (
                <Card
                  key={activity.id}
                  className="cursor-pointer hover:shadow-md transition"
                  onClick={() => setSelectedActivity(activity)}
                >
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                          {activityIcons[activity.activity_type]}
                        </div>
                        <div className="flex-1">
                          <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                          <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                          {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>}
                          <p className="text-sm mt-1" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                          {activity.duration_minutes > 0 && (
                            <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.duration_minutes} min</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm whitespace-nowrap" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {visibleCount < pastActivities.length && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCount(v => v + 10)}
                    style={{ borderColor: '#B8956A', color: '#B8956A' }}
                  >
                    Load More ({pastActivities.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex justify-center pb-4">
        <Button
          variant="outline"
          onClick={() => setShowArchive(true)}
          className="gap-2"
          style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}
        >
          <Archive className="w-4 h-4" />
          View Activity Archive
        </Button>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedActivity} onOpenChange={() => { setSelectedActivity(null); setEditingActivity(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex justify-between items-center pr-6">
              <DialogTitle>Activity Details</DialogTitle>
              {selectedActivity && !editingActivity && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  style={{ borderColor: 'rgba(184,149,106,0.4)', color: '#B8956A' }}
                  onClick={() => setEditingActivity({
                    notes: selectedActivity.notes || '',
                    activity_type: selectedActivity.activity_type,
                    activity_date: selectedActivity.activity_date ? new Date(selectedActivity.activity_date).toISOString().slice(0,16) : '',
                    duration_minutes: selectedActivity.duration_minutes || '',
                  })}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-5">
              {editingActivity ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Type</label>
                    <Select value={editingActivity.activity_type} onValueChange={v => setEditingActivity(p => ({ ...p, activity_type: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Date & Time</label>
                    <Input type="datetime-local" className="h-9 text-sm" value={editingActivity.activity_date} onChange={e => setEditingActivity(p => ({ ...p, activity_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Duration (minutes)</label>
                    <Input type="number" className="h-9 text-sm" value={editingActivity.duration_minutes} onChange={e => setEditingActivity(p => ({ ...p, duration_minutes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide mb-1 block" style={{ color: 'rgba(26,26,26,0.5)' }}>Notes</label>
                    <Textarea className="text-sm" rows={4} value={editingActivity.notes} onChange={e => setEditingActivity(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingActivity(null)}>Cancel</Button>
                    <Button size="sm" disabled={isSavingEdit} style={{ backgroundColor: '#B8956A', color: '#fff' }}
                      onClick={async () => {
                        setIsSavingEdit(true);
                        await base44.entities.ActivityLog.update(selectedActivity.id, {
                          activity_type: editingActivity.activity_type,
                          activity_date: new Date(editingActivity.activity_date).toISOString(),
                          duration_minutes: Number(editingActivity.duration_minutes) || 0,
                          notes: editingActivity.notes,
                        });
                        setSelectedActivity(null);
                        setEditingActivity(null);
                        setIsSavingEdit(false);
                      }}
                    >
                      {isSavingEdit ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                    <p><span className="font-medium">Type:</span> {activityLabels[selectedActivity.activity_type]}</p>
                    <p><span className="font-medium">Date:</span> {format(new Date(selectedActivity.activity_date), "MMM d, yyyy h:mm a")}</p>
                    {selectedActivity.duration_minutes > 0 && (
                      <p><span className="font-medium">Duration:</span> {selectedActivity.duration_minutes} minutes</p>
                    )}
                    <p><span className="font-medium">Notes:</span> {selectedActivity.notes}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                    <p className="font-medium text-sm mb-1" style={{ color: 'rgba(26,26,26,0.6)' }}>Contact</p>
                    {selectedActivity.contact_name && <p>{selectedActivity.contact_name}</p>}
                    {selectedActivity.contact_email && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{selectedActivity.contact_email}</p>}
                    {selectedActivity.company_name && <p className="text-sm">{selectedActivity.company_name}</p>}
                  </div>
                  {selectedActivity.picture_urls?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedActivity.picture_urls.map((url, idx) => (
                        <img key={idx} src={url} alt={`Activity ${idx + 1}`} className="rounded-lg max-h-48 w-auto cursor-zoom-in hover:opacity-90 transition" onClick={() => setZoomedImage(url)} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image zoom */}
      {zoomedImage && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 999999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="Zoomed" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '12px' }} />
        </div>
      )}
    </div>
  );
}