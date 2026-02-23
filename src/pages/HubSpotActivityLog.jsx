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
import { Plus, Phone, Mail, Calendar, Check, AlertCircle, Clock, Zap, MessageSquare, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import EmailComposer from "@/components/sales/EmailComposer";
import IphoneDialer from "@/components/sales/IphoneDialer";
import HubSpotContactSearch from "@/components/sales/HubSpotContactSearch";
import MyContacts from "@/components/sales/MyContacts";
import PoweredByFooter from "@/components/PoweredByFooter";

export default function HubSpotActivityLog() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("activity");
  const [showForm, setShowForm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ current: "", newPw: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);
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
    queryKey: ['activities', user?.email],
    queryFn: async () => {
      const allActivities = await base44.entities.ActivityLog.list('-activity_date', 200);
      return allActivities.filter(a => a.sales_member_email === user?.email);
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
        contact_phone: "",
        company_name: "",
        activity_date: new Date().toISOString().slice(0, 16),
        notes: "",
        duration_minutes: 0
      });
    }
  });

  const handleChangePassword = async () => {
    if (!passwordData.newPw || !passwordData.current) {
      setPasswordMsg({ type: "error", text: "Please fill in all fields" });
      return;
    }
    if (passwordData.newPw !== passwordData.confirm) {
      setPasswordMsg({ type: "error", text: "New passwords do not match" });
      return;
    }
    try {
      const res = await base44.functions.invoke('changeSalesRepPassword', {
        salesMemberId: user.id,
        currentPassword: passwordData.current,
        newPassword: passwordData.newPw
      });
      if (res.data?.success) {
        setPasswordMsg({ type: "success", text: "Password updated successfully!" });
        setPasswordData({ current: "", newPw: "", confirm: "" });
      } else {
        setPasswordMsg({ type: "error", text: res.data?.error || "Failed to update password" });
      }
    } catch {
      setPasswordMsg({ type: "error", text: "Failed to update password" });
    }
  };

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
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>Sales Tools</h1>
            <p className="mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Log activities and send emails</p>
          </div>
          <div className="flex gap-2 items-center">
            {user?.type === 'sales' && (
            <Button variant="outline" size="sm" onClick={() => { setShowPasswordModal(true); setPasswordMsg(null); }}>
              Change Password
            </Button>
          )}
            {activeTab === "activity" && (
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
            )}
          </div>
        </div>

        {/* Change Password Modal */}
        <Dialog open={showPasswordModal} onOpenChange={(open) => { setShowPasswordModal(open); if (!open) setPasswordMsg(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Current Password</label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    placeholder="Current password"
                    value={passwordData.current}
                    onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    placeholder="New password"
                    value={passwordData.newPw}
                    onChange={(e) => setPasswordData({ ...passwordData, newPw: e.target.value })}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                />
              </div>
              {passwordMsg && (
                <p className={`text-sm ${passwordMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{passwordMsg.text}</p>
              )}
              <Button className="w-full" onClick={handleChangePassword}>Update Password</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-[#B8956A]/20">
          <button
            onClick={() => setActiveTab("activity")}
            className="px-4 py-3 font-medium border-b-2 transition"
            style={{
              color: activeTab === "activity" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "activity" ? '#B8956A' : 'transparent'
            }}
          >
            Activity Log
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className="px-4 py-3 font-medium border-b-2 transition"
            style={{
              color: activeTab === "email" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "email" ? '#B8956A' : 'transparent'
            }}
          >
            Send Email
          </button>
          <button
            onClick={() => setActiveTab("call")}
            className="px-4 py-3 font-medium border-b-2 transition"
            style={{
              color: activeTab === "call" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "call" ? '#B8956A' : 'transparent'
            }}
          >
            <span className="flex items-center gap-1"><Phone className="w-4 h-4" />Dialer</span>
          </button>
          <button
            onClick={() => setActiveTab("hubspot")}
            className="px-4 py-3 font-medium border-b-2 transition"
            style={{
              color: activeTab === "hubspot" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "hubspot" ? '#B8956A' : 'transparent'
            }}
          >
            Search Contacts
          </button>
          <button
            onClick={() => setActiveTab("mycontacts")}
            className="px-4 py-3 font-medium border-b-2 transition"
            style={{
              color: activeTab === "mycontacts" ? '#B8956A' : 'rgba(26, 26, 26, 0.6)',
              borderBottomColor: activeTab === "mycontacts" ? '#B8956A' : 'transparent'
            }}
          >
            My Contacts
          </button>
        </div>

        {activeTab === "email" && (
          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20' }}>
            <CardContent className="pt-6">
              <EmailComposer salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "call" && (
          <Card style={{ backgroundColor: '#FFFFFF', borderColor: '#B8956A/20', height: '600px' }}>
            <CardContent className="pt-0 h-full">
              <IphoneDialer salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "hubspot" && (
          <Card style={{ backgroundColor: '#FFFFFF' }}>
            <CardContent className="pt-6">
              <HubSpotContactSearch salesMemberId={user?.id} />
            </CardContent>
          </Card>
        )}

        {activeTab === "mycontacts" && (
          <MyContacts salesMemberId={user?.id} salesMemberEmail={user?.email} />
        )}

        {activeTab === "activity" && (
          <>
            {upcomingActivities.length > 0 && (
              <div className="mb-8">
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

            <div className="mb-8">
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
                    <Card key={activity.id}>
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
          </>
        )}
      </div>
      <PoweredByFooter />
    </div>
  );
}