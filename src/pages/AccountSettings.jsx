import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Trash2, Clock, Mail, Phone, Mail as MailIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setEditEmail(u.email || "");
      setEditPhone(u.phone_number || "");
      // Check if redirected here to change password
      const params = new URLSearchParams(window.location.search);
      if (params.get('change_password') === 'true' && u?.needs_password_change) {
        setShowPasswordPrompt(true);
      }
    }).catch(() => {
      base44.auth.redirectToLogin();
    });
  }, []);

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('deleteAccount');
      // Refresh user data to show scheduled deletion
      const updatedUser = await base44.auth.me();
      setUser(updatedUser);
    } catch (error) {
      alert('Failed to schedule account deletion: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDeletion = async () => {
    setLoading(true);
    try {
      await base44.auth.updateMe({ deletion_scheduled_date: null });
      const updatedUser = await base44.auth.me();
      setUser(updatedUser);
    } catch (error) {
      alert('Failed to cancel deletion: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <p className="text-[#1A1A1A]/60">Loading...</p>
      </div>
    );
  }

  const isDeletionScheduled = user.deletion_scheduled_date;

  const dismissPasswordPrompt = async () => {
    await base44.auth.updateMe({ needs_password_change: false });
    setShowPasswordPrompt(false);
    const updatedUser = await base44.auth.me();
    setUser(updatedUser);
  };

  const handleUpdateEmail = async () => {
    setEditLoading(true);
    try {
      const response = await base44.functions.invoke('updateAccountDetails', {
        accountId: user.id,
        email: editEmail,
        phoneNumber: user.phone_number
      });
      if (response.data.success) {
        const updatedUser = await base44.auth.me();
        setUser(updatedUser);
        setIsEditingEmail(false);
        alert('Email updated successfully');
      } else {
        alert(response.data.error || 'Failed to update email');
      }
    } catch (error) {
      alert('Failed to update email: ' + error.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdatePhone = async () => {
    setEditLoading(true);
    try {
      const response = await base44.functions.invoke('updateAccountDetails', {
        accountId: user.id,
        email: user.email,
        phoneNumber: editPhone
      });
      if (response.data.success) {
        const updatedUser = await base44.auth.me();
        setUser(updatedUser);
        setIsEditingPhone(false);
        alert('Phone number updated successfully');
      } else {
        alert(response.data.error || 'Failed to update phone');
      }
    } catch (error) {
      alert('Failed to update phone: ' + error.message);
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A1A1A]">Account Settings</h1>
          <p className="text-[#1A1A1A]/60 mt-2">Manage your account preferences</p>
        </div>

        {showPasswordPrompt && (
          <Card className="border-[#B8956A] bg-[#B8956A]/5">
            <CardHeader>
              <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-[#B8956A]" />
                Please Change Your Password
              </CardTitle>
              <CardDescription>
                For security, you need to set a permanent password. You received an email with instructions to set your password. Please check your inbox and follow the link to create your permanent password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={dismissPasswordPrompt}
                className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
              >
                I've Changed My Password
              </Button>
            </CardContent>
          </Card>
        )}

        {isDeletionScheduled && (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader>
              <CardTitle className="text-yellow-700 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Account Deletion Scheduled
              </CardTitle>
              <CardDescription>
                Your account is scheduled to be permanently deleted on{' '}
                <strong>{format(new Date(isDeletionScheduled), 'MMMM d, yyyy')}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleCancelDeletion}
                variant="outline"
                disabled={loading}
              >
                {loading ? "Canceling..." : "Cancel Deletion"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-[#B8956A]/20">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">Account Information</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium text-[#1A1A1A]/60">Full Name</label>
              <p className="text-[#1A1A1A] font-medium">{user.full_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#1A1A1A]/60">Email</label>
              <p className="text-[#1A1A1A] font-medium">{user.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-[#1A1A1A]/60">Account Type</label>
              <p className="text-[#1A1A1A] font-medium capitalize">
                {user.role === 'admin' ? 'Admin' : user.user_type || 'User'}
              </p>
            </div>
          </CardContent>
        </Card>

        {!isDeletionScheduled && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="text-red-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>Irreversible account actions</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2" disabled={loading}>
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Schedule Account Deletion?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your account will be scheduled for deletion in 30 days. You can cancel
                      this at any time before the deletion date. An email will be sent to the
                      administrator for confirmation.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-red-600 hover:bg-red-700"
                      disabled={loading}
                    >
                      {loading ? "Scheduling..." : "Yes, schedule deletion"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}