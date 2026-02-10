import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Trash2 } from "lucide-react";
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

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {
      base44.auth.redirectToLogin();
    });
  }, []);

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('deleteAccount');
      window.location.href = '/login';
    } catch (error) {
      alert('Failed to delete account: ' + error.message);
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

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A1A1A]">Account Settings</h1>
          <p className="text-[#1A1A1A]/60 mt-2">Manage your account preferences</p>
        </div>

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
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account
                    and remove all of your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={loading}
                  >
                    {loading ? "Deleting..." : "Yes, delete my account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}