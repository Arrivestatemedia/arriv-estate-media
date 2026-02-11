import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Edit2, Key, Search } from "lucide-react";
import { format } from "date-fns";

export default function ManageUsers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await base44.functions.invoke("listAllUsers");
      return response.data.users || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke("updateUser", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      setEditFormData({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (user_id) =>
      base44.functions.invoke("deleteUser", { user_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeletingUser(null);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (user_ids) =>
      base44.functions.invoke("batchDeleteUsers", { user_ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setSelectedUsers(new Set());
      setShowBatchDeleteConfirm(false);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (data) =>
      base44.functions.invoke("resetUserPassword", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setResettingPassword(null);
    },
  });

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditFormData({
      full_name: user.full_name,
      phone_number: user.phone_number || "",
      user_type: user.user_type || "",
      role: user.role || "user",
    });
  };

  const handleSaveEdit = () => {
    updateMutation.mutate({
      user_id: editingUser.id,
      ...editFormData,
    });
  };

  const handleDeleteClick = (user) => {
    setDeletingUser(user);
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate(deletingUser.id);
  };

  const handleResetPassword = (user) => {
    setResettingPassword(user);
  };

  const handleConfirmResetPassword = () => {
    resetPasswordMutation.mutate({
      user_id: resettingPassword.id,
      user_email: resettingPassword.email,
    });
  };

  const toggleUserSelection = (userId) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleBatchDelete = () => {
    batchDeleteMutation.mutate(Array.from(selectedUsers));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <p className="text-[#1A1A1A]/60">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A1A1A]">Manage Users</h1>
          <p className="text-[#1A1A1A]/60 mt-2">
            View, edit, and delete user accounts
          </p>
        </div>

        <Card className="border-[#B8956A]/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-[#1A1A1A]">Users</CardTitle>
                <CardDescription>Total: {filteredUsers.length} users</CardDescription>
              </div>
              {selectedUsers.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowBatchDeleteConfirm(true)}
                  disabled={batchDeleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete {selectedUsers.size} Selected
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#1A1A1A]/40" />
                <Input
                  placeholder="Search by email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-[#B8956A]/20"
                />
              </div>
            </div>

            <div className="rounded-lg border border-[#B8956A]/20 overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#B8956A]/5">
                  <TableRow className="border-[#B8956A]/20">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-[#1A1A1A]">Email</TableHead>
                    <TableHead className="text-[#1A1A1A]">Name</TableHead>
                    <TableHead className="text-[#1A1A1A]">Type</TableHead>
                    <TableHead className="text-[#1A1A1A]">Role</TableHead>
                    <TableHead className="text-[#1A1A1A]">Phone</TableHead>
                    <TableHead className="text-[#1A1A1A]">Status</TableHead>
                    <TableHead className="text-[#1A1A1A]">Created</TableHead>
                    <TableHead className="text-[#1A1A1A]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className="border-[#B8956A]/20 hover:bg-[#B8956A]/5"
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                      </TableCell>
                      <TableCell className="text-[#1A1A1A] font-medium">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-[#1A1A1A]">
                        {user.full_name}
                      </TableCell>
                      <TableCell className="text-[#1A1A1A] capitalize">
                        {user.user_type || "-"}
                      </TableCell>
                      <TableCell className="text-[#1A1A1A] capitalize">
                        {user.role}
                      </TableCell>
                      <TableCell className="text-[#1A1A1A]">
                        {user.phone_number || "-"}
                      </TableCell>
                      <TableCell className="text-[#1A1A1A]">
                        <span className={`text-xs px-2 py-1 rounded ${
                          user.status === 'verified' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {user.status === 'verified' ? 'Verified' : 'Pending'}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#1A1A1A] text-sm">
                        {format(new Date(user.created_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditClick(user)}
                            className="border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResetPassword(user)}
                            className="border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                          >
                            <Key className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="border-[#B8956A]/20">
          <DialogHeader>
            <DialogTitle className="text-[#1A1A1A]">Edit User</DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label className="text-[#1A1A1A]">Full Name</Label>
                <Input
                  value={editFormData.full_name || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      full_name: e.target.value,
                    })
                  }
                  className="border-[#B8956A]/20 mt-1"
                />
              </div>
              <div>
                <Label className="text-[#1A1A1A]">Phone Number</Label>
                <Input
                  value={editFormData.phone_number || ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      phone_number: e.target.value,
                    })
                  }
                  className="border-[#B8956A]/20 mt-1"
                />
              </div>
              <div>
                <Label className="text-[#1A1A1A]">User Type</Label>
                <Select
                  value={editFormData.user_type || ""}
                  onValueChange={(value) =>
                    setEditFormData({
                      ...editFormData,
                      user_type: value,
                    })
                  }
                >
                  <SelectTrigger className="border-[#B8956A]/20 mt-1">
                    <SelectValue placeholder="Select user type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#1A1A1A]">Role</Label>
                <Select
                  value={editFormData.role || ""}
                  onValueChange={(value) =>
                    setEditFormData({
                      ...editFormData,
                      role: value,
                    })
                  }
                >
                  <SelectTrigger className="border-[#B8956A]/20 mt-1">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="border-[#B8956A]/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="bg-[#B8956A] hover:bg-[#B8956A]/90 text-white"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation */}
      <AlertDialog open={!!resettingPassword} onOpenChange={() => setResettingPassword(null)}>
        <AlertDialogContent className="border-[#B8956A]/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1A1A1A]">Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Send a password reset notification to {resettingPassword?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#B8956A]/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmResetPassword}
              disabled={resetPasswordMutation.isPending}
              className="bg-[#B8956A] hover:bg-[#B8956A]/90"
            >
              {resetPasswordMutation.isPending ? "Sending..." : "Send Reset Email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent className="border-red-200 bg-red-50/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingUser?.email}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-red-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Delete Confirmation */}
      <AlertDialog open={showBatchDeleteConfirm} onOpenChange={setShowBatchDeleteConfirm}>
        <AlertDialogContent className="border-red-200 bg-red-50/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">Delete Users</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-red-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={batchDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {batchDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedUsers.size} Users`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}