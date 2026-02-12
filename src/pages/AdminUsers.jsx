import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, AlertCircle, Mail, Phone, Calendar, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
                        <Badge variant={u.user_type === "media_partner" ? "default" : "secondary"}>
                          {u.user_type === "media_partner" ? "Media Partner" : "Client"}
                        </Badge>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(u.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 -mt-1"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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