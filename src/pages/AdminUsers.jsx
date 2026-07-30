import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, AlertCircle, Mail, Phone, Calendar, Shield, Check, X, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminUsers() {
  const [user, setUser] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ user_type: "", user_role: "" });
  const queryClient = useQueryClient();

  useEffect(() => {
    const userRole = localStorage.getItem('user_role') || sessionStorage.getItem('user_role');
    const salesRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
    if (userRole !== 'admin' && salesRole !== 'admin') {
      window.location.href = "/";
    } else {
      setUser({ role: 'admin' });
    }
  }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const res = await base44.functions.invoke('listAllUsers');
      return res.data?.users || [];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["pending-signups"],
    queryFn: () => base44.entities.PendingSignup.list(),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["all-jobs"],
    queryFn: () => base44.entities.Job.list(),
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["all-bookings"],
    queryFn: () => base44.entities.Booking.list(),
  });

  const getUserPayoutInfo = (userEmail) => {
    const userRecord = users.find(u => u.email === userEmail);
    if (!userRecord || !userRecord.payout_method) return null;
    if (userRecord.payout_method === "zelle") {
      return { method: "Zelle", details: userRecord.zelle_info };
    }
    return { method: "Bank Account", details: `${userRecord.bank_account_number} | Routing: ${userRecord.bank_routing_number}` };
  };

  const getMediaPartnerEarnings = (email) => {
    return jobs
      .filter(job => job.booked_by === email && job.status === "completed")
      .reduce((sum, job) => sum + (job.pay_rate || 0), 0);
  };

  const getClientSpending = (email) => {
    return bookings
      .filter(booking => booking.client_email === email && booking.status === "completed")
      .reduce((sum, booking) => sum + (booking.total_price || 0), 0);
  };

  const deleteMutation = useMutation({
    mutationFn: (userId) => base44.entities.PendingSignup.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-signups"] });
      setDeleteConfirm(null);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (userIds) => {
      await Promise.all(userIds.map((id) => base44.entities.PendingSignup.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-signups"] });
      setSelectedUsers(new Set());
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('updateUserPermissions', { 
      pendingSignupId: data.id, 
      email: data.email, 
      userType: data.user_type, 
      userRole: data.user_role 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-signups"] });
      setEditingId(null);
      setEditData({ user_type: "", user_role: "" });
    },
  });

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedUsers(new Set(users.map((u) => u.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleSelectUser = (userId, checked) => {
    const newSelected = new Set(selectedUsers);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleDelete = (userId) => {
    setDeleteConfirm({ type: "single", ids: [userId] });
  };

  const handleBatchDelete = () => {
    if (selectedUsers.size > 0) {
      setDeleteConfirm({ type: "batch", ids: Array.from(selectedUsers) });
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirm.type === "single") {
      deleteMutation.mutate(deleteConfirm.ids[0]);
    } else {
      batchDeleteMutation.mutate(deleteConfirm.ids);
    }
  };

  const handleEdit = (u) => {
    setEditingId(u.id);
    setEditData({ user_type: u.user_type, user_role: u.user_role });
  };

  const handleSaveEdit = () => {
    const user = users.find(u => u.id === editingId);
    updateMutation.mutate({ id: editingId, email: user?.email, ...editData });
  };

  if (!user || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">User Management</h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage pending signups</p>
        </div>

        {selectedUsers.size > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {selectedUsers.size} user(s) selected
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                disabled={batchDeleteMutation.isPending}
              >
                Delete Selected
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-[var(--border-color)]">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Pending Signups ({users.length})</CardTitle>
            <Checkbox
              checked={selectedUsers.size === users.length && users.length > 0}
              onCheckedChange={handleSelectAll}
            />
          </CardHeader>
          <CardContent>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Select
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Phone
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Role
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Payout
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Earnings / Spending
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[var(--text-primary)]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--border-color)] hover:bg-[var(--accent-color)]/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Checkbox
                          checked={selectedUsers.has(u.id)}
                          onCheckedChange={(checked) =>
                            handleSelectUser(u.id, checked)
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">
                        {u.full_name}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{u.email}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {u.phone_number}
                      </td>
                      <td className="py-3 px-4">
                        {editingId === u.id ? (
                          <Select value={editData.user_type} onValueChange={(value) => setEditData({ ...editData, user_type: value })}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Client</SelectItem>
                              <SelectItem value="media_partner">Media Partner</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={u.user_type === "media_partner" ? "default" : "secondary"}>
                            {u.user_type === "media_partner" ? "Media Partner" : "Client"}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {editingId === u.id ? (
                          <Select value={editData.user_role} onValueChange={(value) => setEditData({ ...editData, user_role: value })}>
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="test_user">Test User</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={u.user_role === "admin" ? "default" : u.user_role === "test_user" ? "secondary" : "outline"} className="flex items-center gap-1 w-fit">
                            {u.user_role === "admin" ? (
                              <>
                                <Shield className="w-3 h-3" />
                                Admin
                              </>
                            ) : u.user_role === "test_user" ? (
                              "Test User"
                            ) : (
                              "User"
                            )}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] text-sm">
                       {(() => {
                         const payoutInfo = getUserPayoutInfo(u.email);
                         return payoutInfo ? (
                           <div className="text-xs">
                             <Badge variant="outline" className="text-xs mb-1">{payoutInfo.method}</Badge>
                             {payoutInfo.details && <div className="text-[var(--text-secondary)] text-xs mt-1">{payoutInfo.details}</div>}
                           </div>
                         ) : <span className="text-xs">—</span>;
                       })()}
                      </td>
                      <td className="py-3 px-4">
                       {u.user_type === "media_partner" ? (
                         <div className="text-sm font-medium text-green-600">
                           ${getMediaPartnerEarnings(u.email).toFixed(2)}
                         </div>
                       ) : (
                         <div className="text-sm font-medium text-blue-600">
                           ${getClientSpending(u.email).toFixed(2)}
                         </div>
                       )}
                      </td>
                      <td className="py-3 px-4 flex gap-2">
                        {editingId === u.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleSaveEdit}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              disabled={updateMutation.isPending}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingId(null)}
                              className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(u)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-8 text-[var(--text-secondary)]">
                  No pending signups
                </div>
              )}
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-4">
              {users.map((u) => (
                <div key={u.id} className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedUsers.has(u.id)}
                        onCheckedChange={(checked) => handleSelectUser(u.id, checked)}
                      />
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{u.full_name}</h3>
                        <Badge variant={u.user_type === "media_partner" ? "default" : "secondary"} className="text-xs mt-1">
                          {u.user_type === "media_partner" ? "Media Partner" : "Client"}
                        </Badge>
                      </div>
                    </div>
                    {editingId !== u.id && (
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => handleDelete(u.id)}
                         className="text-red-600 hover:text-red-700 hover:bg-red-50 -mt-1"
                         disabled={deleteMutation.isPending}
                       >
                         <Trash2 className="w-4 h-4" />
                       </Button>
                     )}
                  </div>
                  
                  <div className="space-y-2 text-sm ml-7">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Mail className="w-4 h-4" />
                      <span>{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                       <Phone className="w-4 h-4" />
                       <span>{u.phone_number}</span>
                     </div>
                     {(() => {
                       const payoutInfo = getUserPayoutInfo(u.email);
                       return payoutInfo ? (
                         <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                             <DollarSign className="w-4 h-4" />
                             <span className="text-xs font-medium">{payoutInfo.method}</span>
                           </div>
                           {payoutInfo.details && <div className="text-xs text-[var(--text-secondary)] ml-6">{payoutInfo.details}</div>}
                         </div>
                       ) : null;
                     })()}
                     <div className="pt-2 border-t border-[var(--border-color)]">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-medium text-[var(--text-secondary)]">
                           {u.user_type === "media_partner" ? "Total Earnings:" : "Total Spent:"}
                         </span>
                         <span className={`text-sm font-bold ${u.user_type === "media_partner" ? "text-green-600" : "text-blue-600"}`}>
                           ${u.user_type === "media_partner" ? getMediaPartnerEarnings(u.email).toFixed(2) : getClientSpending(u.email).toFixed(2)}
                         </span>
                       </div>
                     </div>
                     {editingId === u.id ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs font-medium">Type:</label>
                          <Select value={editData.user_type} onValueChange={(value) => setEditData({ ...editData, user_type: value })}>
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Client</SelectItem>
                              <SelectItem value="media_partner">Media Partner</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Role:</label>
                          <Select value={editData.user_role} onValueChange={(value) => setEditData({ ...editData, user_role: value })}>
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="test_user">Test User</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={handleSaveEdit} className="flex-1 bg-green-600 hover:bg-green-700">
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="flex-1">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant={u.user_role === "admin" ? "default" : u.user_role === "test_user" ? "secondary" : "outline"} className="flex items-center gap-1">
                          {u.user_role === "admin" ? (
                            <>
                              <Shield className="w-3 h-3" />
                              Admin
                            </>
                          ) : u.user_role === "test_user" ? (
                            "Test User"
                          ) : (
                            "User"
                          )}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(u)} className="text-blue-600 hover:bg-blue-50 -mx-2">
                          Edit
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-center py-8 text-[var(--text-secondary)]">
                  No pending signups
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User(s)</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === "batch"
                ? `Are you sure you want to delete ${deleteConfirm?.ids.length} user(s)? This cannot be undone.`
                : "Are you sure you want to delete this user? This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}