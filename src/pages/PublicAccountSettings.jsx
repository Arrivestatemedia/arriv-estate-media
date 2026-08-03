import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Trash2, Mail, ArrowLeft, Lock, Wallet } from "lucide-react";
import { createPageUrl } from "../utils";
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

export default function PublicAccountSettings() {
  const [step, setStep] = useState("lookup"); // lookup, edit, success
  const [email, setEmail] = useState("");
  const [accountData, setAccountData] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [zelleInfo, setZelleInfo] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const response = await base44.functions.invoke('lookupAccount', {
        email: email.toLowerCase()
      });
      
      if (response.data.success) {
        setAccountData(response.data.account);
        setEditEmail(response.data.account.email);
        setEditPhone(response.data.account.phone_number || "");
        setPayoutMethod(response.data.account.payout_method || "");
        setZelleInfo(response.data.account.zelle_info || "");
        setBankAccountNumber(response.data.account.bank_account_number || "");
        setRoutingNumber(response.data.account.bank_routing_number || "");
        setStep("edit");
      } else {
        setError(response.data.error || "Account not found");
      }
    } catch (err) {
      setError("Failed to find account. Please check your email.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    setLoading(true);
    setError("");
    
    try {
      const response = await base44.functions.invoke('updateAccountDetails', {
        accountId: accountData.id,
        email: editEmail,
        phoneNumber: editPhone
      });
      
      if (response.data.success) {
        setAccountData({ ...accountData, email: editEmail, phone_number: editPhone });
        alert('Account updated successfully');
      } else {
        setError(response.data.error || 'Failed to update account');
      }
    } catch (err) {
      setError('Failed to update account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePhone = async () => {
    setLoading(true);
    setError("");
    
    try {
      const response = await base44.functions.invoke('updateAccountDetails', {
        accountId: accountData.id,
        email: editEmail,
        phoneNumber: editPhone
      });
      
      if (response.data.success) {
        setAccountData({ ...accountData, email: editEmail, phone_number: editPhone });
        alert('Phone number updated successfully');
      } else {
        setError(response.data.error || 'Failed to update account');
      }
    } catch (err) {
      setError('Failed to update account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const response = await base44.functions.invoke('updateAccountDetails', {
        accountId: accountData.id,
        password: newPassword
      });
      
      if (response.data.success) {
        setNewPassword("");
        setConfirmPassword("");
        alert('Password updated successfully');
      } else {
        setError(response.data.error || 'Failed to update password');
      }
    } catch (err) {
      setError('Failed to update password: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStripeOnboard = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke('stripeConnectOnboard', {});
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError("Could not start Stripe onboarding");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to start Stripe onboarding");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequest = async () => {
    setLoading(true);
    setError("");
    
    try {
      const response = await base44.functions.invoke('scheduleAccountDeletion', {
        email: accountData.email
      });
      
      if (response.data.success) {
        setStep("success");
      } else {
        setError(response.data.error || 'Failed to schedule deletion');
      }
    } catch (err) {
      setError('Failed to schedule deletion: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <a href={createPageUrl("SignIn")} className="text-[#B8956A] hover:text-[#B8956A]/80 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A]">Manage Your Account</h1>
            <p className="text-[#1A1A1A]/60 mt-1">Update your information or delete your account</p>
          </div>
        </div>

        {step === "lookup" && (
          <Card className="border-[#B8956A]/20">
            <CardHeader>
              <CardTitle className="text-[#1A1A1A]">Find Your Account</CardTitle>
              <CardDescription>Enter your email to access your account settings</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Email Address</label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-[#B8956A]/30 focus:border-[#B8956A]"
                    placeholder="your@email.com"
                  />
                </div>
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
                >
                  {loading ? "Looking up..." : "Access My Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "edit" && accountData && (
          <>
            <Card className="border-[#B8956A]/20">
              <CardHeader>
                <CardTitle className="text-[#1A1A1A]">Account Information</CardTitle>
                <CardDescription>Update your contact details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Full Name</label>
                  <p className="text-[#1A1A1A] font-medium">{accountData.full_name}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Email Address</label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="border-[#B8956A]/30"
                    />
                    <Button
                      size="sm"
                      onClick={handleUpdateEmail}
                      disabled={loading || editEmail === accountData.email}
                      className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
                    >
                      Update
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Phone Number</label>
                  <div className="flex gap-2">
                    <Input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="border-[#B8956A]/30"
                      placeholder="(555) 123-4567"
                    />
                    <Button
                      size="sm"
                      onClick={handleUpdatePhone}
                      disabled={loading || editPhone === (accountData.phone_number || "")}
                      className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
                    >
                      Update
                    </Button>
                  </div>
                </div>

                {error && (
                   <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                     {error}
                   </div>
                 )}
                </CardContent>
                </Card>

                {accountData?.user_type === "media_partner" && (
                  <Card className="border-[#B8956A]/20">
                  <CardHeader>
                  <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Payout Settings
                  </CardTitle>
                  <CardDescription>Direct deposit via Stripe</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert className="bg-blue-50 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-sm text-blue-900">
                        All payouts go through <strong>Stripe Connect</strong> — automatic every
                        Friday to your linked bank account, with optional instant payouts
                        (1.5% fee) to your debit card.
                      </AlertDescription>
                    </Alert>

                    <div className={`flex items-center gap-2 text-sm ${accountData?.stripe_payouts_enabled ? "text-green-700" : "text-amber-700"}`}>
                      <span className={`w-2 h-2 rounded-full ${accountData?.stripe_payouts_enabled ? "bg-green-500" : "bg-amber-500"}`} />
                      {accountData?.stripe_payouts_enabled
                        ? "Payouts enabled — your bank account is linked and ready."
                        : accountData?.stripe_account_id
                          ? "Stripe setup incomplete — update your bank info to finish."
                          : "No Stripe account yet — set up direct deposit to get paid."}
                    </div>

                    <Button
                      onClick={handleStripeOnboard}
                      disabled={loading}
                      className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
                    >
                      {loading ? "Opening Stripe..." : accountData?.stripe_payouts_enabled ? "Update bank info" : "Set up direct deposit"}
                    </Button>
                   </CardContent>
                   </Card>
                 )}

                <Card className="border-[#B8956A]/20">
                <CardHeader>
                <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your account password</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">New Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="border-[#B8956A]/30"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="border-[#B8956A]/30"
                    placeholder="Confirm password"
                  />
                </div>

                <Button
                  onClick={handleUpdatePassword}
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
                >
                  Update Password
                </Button>
                </CardContent>
                </Card>

            <Card className="border-[#B8956A]/20">
              <CardHeader>
                <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Contact Support
                </CardTitle>
                <CardDescription>Get help or report an issue</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-[#1A1A1A] mb-4">Have questions or need assistance?</p>
                <a
                  href="mailto:info@arrivestatemedia.com"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#B8956A] text-white rounded-lg hover:bg-[#B8956A]/90 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  info@arrivestatemedia.com
                </a>
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
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your account will be scheduled for deletion in 30 days. An email will be sent to the administrator with a link to delete your account immediately if needed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteRequest}
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

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setStep("lookup");
                setEmail("");
                setAccountData(null);
                setError("");
              }}
            >
              Back to Login
            </Button>
          </>
        )}

        {step === "success" && (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader>
              <CardTitle className="text-yellow-700">Account Deletion Scheduled</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[#1A1A1A]">
                Your account will be deleted in 30 days. An email has been sent to the administrator with a link to delete your account immediately if needed.
              </p>
              <a
                href={createPageUrl("SignIn")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white rounded-lg hover:bg-[#1A1A1A]/90 transition-colors"
              >
                Back to Sign In
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}