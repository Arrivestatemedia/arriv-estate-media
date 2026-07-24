import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Eye, EyeOff, ShieldAlert } from "lucide-react";
import PoweredByFooter from "@/components/PoweredByFooter";

export default function SalesChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cur = e.target.currentPassword?.value || currentPassword;
    const next = e.target.newPassword?.value || newPassword;
    const conf = e.target.confirmPassword?.value || confirmPassword;

    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== conf) {
      setError("New passwords do not match.");
      return;
    }
    if (next === cur) {
      setError("New password must be different from your current password.");
      return;
    }

    setLoading(true);
    try {
      const result = await base44.functions.invoke('changeSalesRepPassword', {
        salesMemberId,
        currentPassword: cur,
        newPassword: next,
      });
      if (result.data?.success) {
        localStorage.removeItem('sales_force_password_change');
        sessionStorage.removeItem('sales_force_password_change');
        const tabHint = new URLSearchParams(window.location.search).get('tab');
        const target = createPageUrl('HubSpotActivityLog') + (tabHint ? `?tab=${encodeURIComponent(tabHint)}` : '');
        navigate(target, { replace: true });
      } else {
        setError(result.data?.error || "Could not update password. Please try again.");
      }
    } catch (err) {
      setError(err?.data?.error || "Could not update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="flex-1 flex items-center justify-center w-full">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Set a New Password</CardTitle>
                <CardDescription>Required before you can continue</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              For your security, please choose a new password to replace the temporary one provided during onboarding. You'll use this to sign in from now on.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 items-start">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Current Password</label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    name="currentPassword"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    name="newPassword"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                <Input
                  type={showNew ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Updating..." : "Update Password & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <PoweredByFooter />
    </div>
  );
}