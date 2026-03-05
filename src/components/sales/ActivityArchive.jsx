import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Calendar, Archive, ChevronLeft } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";

const activityIcons = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
};

const activityLabels = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  task: "Task",
  note: "Note",
};

export default function ActivityArchive({ salesMemberId, salesMemberEmail, onClose }) {
  const [archivedActivities, setArchivedActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

  useEffect(() => {
    loadArchive();
  }, [salesMemberId, salesMemberEmail]);

  const loadArchive = async () => {
    setLoading(true);
    try {
      // Get all activities
      const all = await base44.entities.ActivityLog.list('-activity_date', 1000);
      // Filter to this rep's activities
      const mine = salesMemberId
        ? all.filter(a =>
            a.sales_member_id === salesMemberId ||
            a.sales_member_email === salesMemberEmail ||
            a.created_by === salesMemberEmail
          )
        : all;

      // Only past activities older than 30 days
      const cutoff = subDays(new Date(), 30);
      const archived = mine.filter(a =>
        new Date(a.activity_date) <= new Date() &&
        new Date(a.activity_date) < cutoff
      );

      setArchivedActivities(archived);

      // Auto-select the most recent month
      if (archived.length > 0) {
        const months = getMonthGroups(archived);
        if (months.length > 0) setSelectedMonthKey(months[0].key);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getMonthGroups = (activities) => {
    const groups = {};
    activities.forEach(a => {
      const d = new Date(a.activity_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = format(d, "MMMM yyyy");
      if (!groups[key]) groups[key] = { key, label, activities: [] };
      groups[key].activities.push(a);
    });
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
  };

  const monthGroups = getMonthGroups(archivedActivities);
  const selectedMonthActivities = monthGroups.find(m => m.key === selectedMonthKey)?.activities || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Archive className="w-5 h-5" style={{ color: '#B8956A' }} />
          <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Activity Archive</h2>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : archivedActivities.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
            <Archive className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No archived activities yet</p>
            <p className="text-sm mt-1">Activities older than 30 days will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Select month:</p>
            <Select value={selectedMonthKey || ""} onValueChange={setSelectedMonthKey}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Choose a month" />
              </SelectTrigger>
              <SelectContent>
                {monthGroups.map(m => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label} ({m.activities.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMonthKey && (
            <div className="space-y-3">
              <p className="text-sm font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>
                {selectedMonthActivities.length} activit{selectedMonthActivities.length !== 1 ? 'ies' : 'y'} in {monthGroups.find(m => m.key === selectedMonthKey)?.label}
              </p>
              {selectedMonthActivities.map(activity => (
                <Card
                  key={activity.id}
                  className="cursor-pointer hover:shadow-md transition"
                  onClick={() => setSelectedActivity(activity)}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                          {activityIcons[activity.activity_type] || <Calendar className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <Badge variant="outline">{activityLabels[activity.activity_type] || activity.activity_type}</Badge>
                          {(activity.contact_name || activity.company_name) && (
                            <p className="font-medium mt-1" style={{ color: '#1A1A1A' }}>
                              {activity.contact_name || activity.company_name}
                            </p>
                          )}
                          {activity.contact_email && (
                            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.contact_email}</p>
                          )}
                          <p className="text-sm mt-1" style={{ color: '#1A1A1A' }}>
                            {activity.notes?.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}
                          </p>
                          {activity.duration_minutes > 0 && (
                            <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>{activity.duration_minutes} minutes</p>
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
            </div>
          )}
        </>
      )}

      {/* Activity detail dialog */}
      <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                <p><span className="font-medium">Type:</span> {activityLabels[selectedActivity.activity_type] || selectedActivity.activity_type}</p>
                <p><span className="font-medium">Date:</span> {format(new Date(selectedActivity.activity_date), "MMM d, yyyy h:mm a")}</p>
                <p><span className="font-medium">Notes:</span> {selectedActivity.notes?.replace(/HubSpot contact/g, 'Contact').replace(/HubSpot/g, '')}</p>
                {selectedActivity.duration_minutes > 0 && (
                  <p><span className="font-medium">Duration:</span> {selectedActivity.duration_minutes} minutes</p>
                )}
              </div>
              {(selectedActivity.contact_name || selectedActivity.contact_email || selectedActivity.company_name) && (
                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                  <p className="font-medium text-sm mb-1">Contact</p>
                  {selectedActivity.contact_name && <p><span className="font-medium">Name:</span> {selectedActivity.contact_name}</p>}
                  {selectedActivity.contact_email && <p><span className="font-medium">Email:</span> {selectedActivity.contact_email}</p>}
                  {selectedActivity.company_name && <p><span className="font-medium">Company:</span> {selectedActivity.company_name}</p>}
                </div>
              )}
              {selectedActivity.picture_urls?.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Pictures</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedActivity.picture_urls.map((url, i) => (
                      <img key={i} src={url} alt={`Activity ${i + 1}`} className="rounded-lg max-h-40 w-auto" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}