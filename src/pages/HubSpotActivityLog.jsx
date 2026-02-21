import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, Calendar, Check, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function HubSpotActivityLog() {
  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    activity_type: "call",
    contact_email: "",
    contact_name: "",
    company_name: "",
    activity_date: new Date().toISOString().slice(0, 16),
    notes: "",
    duration_minutes: 0
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    // Check if sales member is logged in via localStorage
    const salesMemberId = localStorage.getItem('sales_member_id');
    if (salesMemberId) {
      setUser({
        id: salesMemberId,
        full_name: localStorage.getItem('sales_member_name'),
        email: localStorage.getItem('sales_member_email'),
        type: 'sales'
      });
    } else {
      // Check for admin via base44
      base44.auth.me().then((adminUser) => {
        if (adminUser && adminUser.role === 'admin') {
          setUser(adminUser);
        } else {
          // Redirect to sales login if not authenticated as sales or admin
          window.location.href = '/SalesLogin';
        }
      }).catch(() => {
        window.location.href = '/SalesLogin';
      });
    }
  }, []);

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const allActivities = await base44.entities.ActivityLog.list('-activity_date', 100);
      // Filter to show only activities created by the current user
      if (user?.type === 'sales') {
        return allActivities.filter(a => a.created_by === user.email);
      }
      return allActivities;
    },
    initialData: [],
    enabled: !!user,
  });

  // Get upcoming activities (future dates)
  const upcomingActivities = activities
    .filter(a => new Date(a.activity_date) > new Date())
    .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
    .slice(0, 5);

  // Get past activities
  const pastActivities = activities
    .filter(a => new Date(a.activity_date) <= new Date())
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date));

  const createActivityMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.ActivityLog.create(data);
      // Sync to HubSpot
      await base44.functions.invoke('syncActivityToHubSpot', { activityId: result.id });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      setShowForm(false);
      setFormData({
        activity_type: "call",
        contact_email: "",
        contact_name: "",
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
    if (!formData.contact_name && !formData.company_name) {
      alert("Please enter either a contact name or company name");
      return;
    }
    if (!formData.notes.trim()) {
      alert("Please add notes about the activity");
      return;
    }
    createActivityMutation.mutate(formData);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only sales team members and admins can access the activity log.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
            <p className="text-gray-600 mt-1">Log calls, emails, and meetings synced to HubSpot</p>
          </div>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button className="gap-2">
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
                  <label className="block text-sm font-medium mb-1">Contact Name</label>
                  <Input
                    placeholder="e.g., John Doe"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({...formData, contact_name: e.target.value})}
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

        <div className="space-y-3">
          {activities.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                No activities logged yet
              </CardContent>
            </Card>
          ) : (
            activities.map((activity) => (
              <Card key={activity.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1 p-2 bg-gray-100 rounded-lg">
                        {activityIcons[activity.activity_type]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                          {activity.hubspot_synced ? (
                            <div className="flex items-center gap-1 text-green-600 text-xs">
                              <Check className="w-3 h-3" />
                              Synced
                            </div>
                          ) : activity.sync_error ? (
                            <div className="flex items-center gap-1 text-red-600 text-xs">
                              <AlertCircle className="w-3 h-3" />
                              Sync failed
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">Syncing...</div>
                          )}
                        </div>
                        <p className="font-medium mt-2">{activity.contact_name || activity.company_name}</p>
                        {activity.contact_email && <p className="text-sm text-gray-600">{activity.contact_email}</p>}
                        {activity.company_name && <p className="text-sm text-gray-600">{activity.company_name}</p>}
                        <p className="text-sm text-gray-700 mt-2">{activity.notes}</p>
                        {activity.duration_minutes > 0 && (
                          <p className="text-xs text-gray-500 mt-1">{activity.duration_minutes} minutes</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}