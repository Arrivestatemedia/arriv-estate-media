import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, AlertCircle } from "lucide-react";
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
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then((userData) => {
      if (userData?.role !== "admin") {
        window.location.href = "/";
      }
      setUser(userData);
    });
  }, []);

  const { data: users = [] } = useQuery({
    queryKey: ["pending-signups"],
    queryFn: () => base44.entities.PendingSignup.list(),
  });

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

  if (!user || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A1A1A]">User Management</h1>
          <p className="text-[#1A1A1A]/60 mt-1">Manage pending signups</p>
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

        <Card className="border-[#B8956A]/20">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle>Pending Signups ({users.length})</CardTitle>
            <Checkbox
              checked={selectedUsers.size === users.length && users.length > 0}
              onCheckedChange={handleSelectAll}
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#B8956A]/20">
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Select
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Phone
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-[#1A1A1A]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[#B8956A]/10 hover:bg-[#B8956A]/5 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Checkbox
                          checked={selectedUsers.has(u.id)}
                          onCheckedChange={(checked) =>
                            handleSelectUser(u.id, checked)
                          }
                        />
                      </td>
                      <td className="py-3 px-4 text-[#1A1A1A]">
                        {u.full_name}
                      </td>
                      <td className="py-3 px-4 text-[#1A1A1A]/70">{u.email}</td>
                      <td className="py-3 px-4 text-[#1A1A1A]/70">
                        {u.phone_number}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-[#B8956A]/10 text-[#B8956A] rounded text-xs font-medium">
                          {u.user_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(u.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-8 text-[#1A1A1A]/60">
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