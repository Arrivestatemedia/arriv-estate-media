import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle, Pencil, Eye, EyeOff, Mail } from "lucide-react";

export default function AdminSalesSignup() {
  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editData, setEditData] = useState({});
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone_number: "",
    password: ""
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: salesMembers = [], error: fetchError } = useQuery({
    queryKey: ['salesTeam'],
    queryFn: async () => {
      const result = await base44.entities.SalesTeamMember.list('-created_date');
      console.log('Sales members fetched:', result);
      return result;
    },
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.functions.invoke('createSalesTeamMember', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesTeam'] });
      setShowForm(false);
      setFormData({ email: "", full_name: "", phone_number: "", password: "" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SalesTeamMember.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesTeam'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SalesTeamMember.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesTeam'] });
      setEditingMember(null);
    }
  });

  const handleEditSave = () => {
    const { password, ...dataWithoutPassword } = editData;
    updateMutation.mutate({ id: editingMember.id, data: dataWithoutPassword });
  };

  const changePasswordMutation = useMutation({
    mutationFn: ({ memberId, newPassword }) => base44.functions.invoke('updateSalesTeamMemberPassword', { memberId, newPassword }),
    onSuccess: () => {
      setNewPassword("");
      alert("Password updated successfully");
    }
  });

  const authorizeGmailMutation = useMutation({
    mutationFn: async (memberId) => {
      const response = await base44.functions.invoke('getSalesGmailAuthUrl', { memberId });
      window.location.href = response.data.authUrl;
    },
    onError: () => {
      alert("Failed to initiate Gmail authorization");
    }
  });

  const handleSubmit = () => {
    if (!formData.email || !formData.full_name || !formData.password) {
      alert("Please fill in all required fields");
      return;
    }
    createMutation.mutate(formData);
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Only admins can manage the sales team.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {fetchError && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-700">Error loading sales team: {fetchError.message}</p>
            </CardContent>
          </Card>
        )}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sales Team Management</h1>
            <p className="text-gray-600 mt-1">Add and manage sales team members</p>
          </div>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Sales Member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Sales Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name *</label>
                  <Input
                    placeholder="e.g., John Smith"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email *</label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <Input
                    placeholder="555-123-4567"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <Input
                    type="password"
                    placeholder="Set initial password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? "Creating..." : "Add Sales Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3">
          {salesMembers.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                No sales team members added yet
              </CardContent>
            </Card>
          ) : (
            salesMembers.map((member) => (
              <Card key={member.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        {member.phone_number && (
                          <p className="text-sm text-gray-600">{member.phone_number}</p>
                        )}
                        {member.company_email && (
                          <p className="text-sm text-gray-500">From: {member.company_email}</p>
                        )}
                        {member.twilio_phone_number && (
                          <p className="text-sm text-gray-500">Twilio: {member.twilio_phone_number}</p>
                        )}
                        {member.gmail_access_token ? (
                          <Badge className="mt-2 bg-blue-100 text-blue-800">Gmail Authorized</Badge>
                        ) : (
                          <Badge className="mt-2 bg-yellow-100 text-yellow-800">Gmail Not Set</Badge>
                        )}
                        <Badge className={`mt-2 ml-2 ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!member.gmail_access_token && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => authorizeGmailMutation.mutate(member.id)}
                          disabled={authorizeGmailMutation.isPending}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Authorize Gmail account for sending emails"
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingMember(member); setEditData({ full_name: member.full_name, email: member.email, phone_number: member.phone_number || "", company_email: member.company_email || "", gmail_access_token: member.gmail_access_token || "", twilio_phone_number: member.twilio_phone_number || "", is_active: member.is_active }); }}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(member.id)}
                        disabled={deleteMutation.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sales Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <Input value={editData.full_name || ""} onChange={(e) => setEditData({...editData, full_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Login Email</label>
              <Input type="email" value={editData.email || ""} onChange={(e) => setEditData({...editData, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <Input value={editData.phone_number || ""} onChange={(e) => setEditData({...editData, phone_number: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Company Email (Send As)</label>
              <Input type="email" placeholder="john@arriv.com" value={editData.company_email || ""} onChange={(e) => setEditData({...editData, company_email: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gmail Access Token</label>
              <Input type="password" placeholder="Paste OAuth access token here" value={editData.gmail_access_token || ""} onChange={(e) => setEditData({...editData, gmail_access_token: e.target.value})} />
              <p className="text-xs text-gray-500 mt-1">Optional: sales member's Gmail OAuth token for sending from their account</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Twilio Phone Number</label>
              <Input placeholder="+15551234567" value={editData.twilio_phone_number || ""} onChange={(e) => setEditData({...editData, twilio_phone_number: e.target.value})} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={!!editData.is_active} onChange={(e) => setEditData({...editData, is_active: e.target.checked})} />
              <label htmlFor="is_active" className="text-sm font-medium">Active</label>
            </div>

            <hr />
            <div>
              <label className="block text-sm font-medium mb-1">Change Password</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowNewPassword(!showNewPassword)}>
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => newPassword && changePasswordMutation.mutate({ memberId: editingMember.id, newPassword })}
                  disabled={!newPassword || changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? "Saving..." : "Set"}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleEditSave} disabled={updateMutation.isPending} className="flex-1">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={() => setEditingMember(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}