import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Zap, Clock } from "lucide-react";
import { format } from "date-fns";

export default function AdminActivityPage({ user }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [formData, setFormData] = useState({
    activity_type: "call",
    contact_email: "",
    contact_name: "",
    contact_phone: "",
    company_name: "",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0
  });

  const queryClient = useQueryClient();

  const { data: activities = [] } = useQuery({
    queryKey: ['adminActivities', user?.email],
    queryFn: async () => {
      const allActivities = await base44.entities.ActivityLog.list('-activity_date', 200);
      return allActivities.filter(a => a.sales_member_email === user?.email);
    },
    initialData: [],
    enabled: !!user,
  });

  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .slice(0, 5);

  const pastActivities = activities
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.ActivityLog.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminActivities'] });
      setShowForm(false);
      setFormData({
        activity_type: "call",
        contact_email: "",
        contact_name: "",
        contact_phone: "",
        company_name: "",
        activity_date: new Date().toISOString().slice(0, 16),
        notes: "",
        duration_minutes: 0
      });
    }
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

  const handleSubmit = () => {
    if (!formData.contact_name && !formData.contact_phone) {
      alert("Please enter a contact name or phone number");
      return;
    }
    if (!formData.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    createActivityMutation.mutate({
      ...formData,
      sales_member_email: user?.email,
      sales_member_id: user?.id
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
              <Plus className="w-4 h-4" />
              Log Activity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Log New Activity</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Activity Type</label>
                <Select value={formData.activity_type} onValueChange={(val) => setFormData({...formData, activity_type: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contact Name *</label>
                <Input
                  placeholder="e.g., John Doe"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone Number *</label>
                <Input
                  placeholder="e.g., (555) 123-4567"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contact Email</label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({...formData, contact_email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <Input
                  placeholder="e.g., Acme Inc"
                  value={formData.company_name}
                  onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Date & Time</label>
                <Input
                  type="datetime-local"
                  value={formData.activity_date}
                  onChange={(e) => setFormData({...formData, activity_date: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.duration_minutes}
                  onChange={(e) => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 0})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea
                  placeholder="Summary of the activity..."
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={createActivityMutation.isPending}
                className="w-full"
              >
                {createActivityMutation.isPending ? "Logging..." : "Log Activity"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {upcomingActivities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5" style={{ color: '#B8956A' }} />
            <h2 className="text-xl font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
            <Badge variant="secondary">{upcomingActivities.length}</Badge>
          </div>
          <div className="space-y-3">
            {upcomingActivities.map((activity) => (
              <Card key={activity.id} style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184, 149, 106, 0.1)' }}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.2)' }}>
                        {activityIcons[activity.activity_type]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" style={{ backgroundColor: 'rgba(184, 149, 106, 0.2)', color: '#B8956A' }}>{activityLabels[activity.activity_type]}</Badge>
                          <Clock className="w-4 h-4" style={{ color: '#B8956A' }} />
                          <span className="text-sm font-medium" style={{ color: '#B8956A' }}>
                            {format(new Date(activity.activity_date), "MMM d 'at' h:mm a")}
                          </span>
                        </div>
                        <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                        {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                        {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                        <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4" style={{ color: '#1A1A1A' }}>Activity History</h2>
        <div className="space-y-3">
          {pastActivities.length === 0 && upcomingActivities.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                No activities logged yet
              </CardContent>
            </Card>
          ) : (
            pastActivities.map((activity) => (
              <Card 
                key={activity.id}
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => setSelectedActivity(activity)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1 p-2 rounded-lg" style={{ backgroundColor: 'rgba(184, 149, 106, 0.15)' }}>
                        {activityIcons[activity.activity_type]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                        </div>
                        <p className="font-medium mt-2" style={{ color: '#1A1A1A' }}>{activity.contact_name || activity.company_name}</p>
                        {activity.contact_email && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.contact_email}</p>}
                        {activity.company_name && <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.company_name}</p>}
                        <p className="text-sm mt-2" style={{ color: '#1A1A1A' }}>{activity.notes}</p>
                        {activity.duration_minutes > 0 && (
                          <p className="text-xs mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>{activity.duration_minutes} minutes</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm whitespace-nowrap" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                      {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Activity Detail Modal */}
      <Dialog open={!!selectedActivity} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Activity</h3>
                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                  <p><span className="font-medium">Type:</span> {activityLabels[selectedActivity.activity_type]}</p>
                  <p><span className="font-medium">Date:</span> {format(new Date(selectedActivity.activity_date), "MMM d, yyyy h:mm a")}</p>
                  <p><span className="font-medium">Notes:</span> {selectedActivity.notes}</p>
                  {selectedActivity.duration_minutes > 0 && (
                    <p><span className="font-medium">Duration:</span> {selectedActivity.duration_minutes} minutes</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                  {selectedActivity.contact_name && <p><span className="font-medium">Name:</span> {selectedActivity.contact_name}</p>}
                  {selectedActivity.contact_email && <p><span className="font-medium">Email:</span> {selectedActivity.contact_email}</p>}
                  {selectedActivity.contact_phone && <p><span className="font-medium">Phone:</span> {selectedActivity.contact_phone}</p>}
                  {selectedActivity.company_name && <p><span className="font-medium">Company:</span> {selectedActivity.company_name}</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}