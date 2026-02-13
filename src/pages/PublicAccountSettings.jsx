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

  const handleUpdatePayout = async () => {
    setPayoutSuccess(false);
    setError("");
    setLoading(true);

    try {
      if (payoutMethod === "zelle") {
        if (!zelleInfo) {
          setError("Please enter Zelle phone number or email");
          setLoading(false);
          return;
        }
      } else if (payoutMethod === "bank_account") {
        if (!bankAccountNumber || !routingNumber) {
          setError("Please enter both account and routing numbers");
          setLoading(false);
          return;
        }
      }

      await base44.functions.invoke('savePayoutSettings', {
        email: accountData.email,
        payout_method: payoutMethod,
        zelle_info: zelleInfo,
        bank_account_number: bankAccountNumber,
        bank_routing_number: routingNumber
      });

      setPayoutSuccess(true);

      // Update the local data to show saved information
      const updatedData = {
        ...accountData,
        payout_method: payoutMethod,
        zelle_info: zelleInfo,
        bank_account_number: bankAccountNumber,
        bank_routing_number: routingNumber,
        bank_account_last4: bankAccountNumber ? bankAccountNumber.slice(-4) : null
      };
      setAccountData(updatedData);

      setTimeout(() => setPayoutSuccess(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to update payout settings");
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

                <Card className="border-[#B8956A]/20">
                <CardHeader>
                <CardTitle className="text-[#1A1A1A] flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  Payout Settings
                </CardTitle>
                <CardDescription>Update your payout method</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                {accountData?.payout_method && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Your Current Payout Method:</h3>
                    <p className="text-blue-800 mb-2">
                      {accountData.payout_method === "zelle" ? "Zelle" : "Bank Account"}
                    </p>
                    {accountData.payout_method === "zelle" && (
                      <p className="text-sm text-blue-700">
                        <strong>Zelle Account:</strong> {accountData.zelle_info}
                      </p>
                    )}
                    {accountData.payout_method === "bank_account" && (
                      <div className="text-sm text-blue-700 space-y-1">
                        <p><strong>Account:</strong> {accountData.bank_account_number}</p>
                        <p><strong>Routing:</strong> {accountData.bank_routing_number}</p>
                      </div>
                    )}
                  </div>
                )}

                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm text-blue-900">
                    <strong>Bank account payouts</strong> take 3-5 business days to deposit. 
                    <strong> Zelle payouts</strong> are typically instant.
                  </AlertDescription>
                </Alert>

                <div>
                  <Label className="mb-2 block">Payout Method</Label>
                  <RadioGroup value={payoutMethod} onValueChange={setPayoutMethod}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="zelle" id="zelle" />
                      <Label htmlFor="zelle" className="font-normal cursor-pointer">Zelle (Instant)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="bank_account" id="bank_account" />
                      <Label htmlFor="bank_account" className="font-normal cursor-pointer">Bank Account (3-5 days)</Label>
                    </div>
                  </RadioGroup>
                </div>

                {payoutMethod === "zelle" && (
                  <div>
                    <Label>Zelle Phone Number or Email</Label>
                    <Input
                      value={zelleInfo}
                      onChange={(e) => setZelleInfo(e.target.value)}
                      placeholder="phone@example.com or +1234567890"
                      className="border-[#B8956A]/30"
                    />
                  </div>
                )}

                {payoutMethod === "bank_account" && (
                  <>
                    <div>
                      <Label>Bank Account Number</Label>
                      <Input
                        type="text"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        placeholder="Account number"
                        className="border-[#B8956A]/30"
                      />
                    </div>
                    <div>
                      <Label>Routing Number</Label>
                      <Input
                        type="text"
                        value={routingNumber}
                        onChange={(e) => setRoutingNumber(e.target.value)}
                        placeholder="9-digit routing number"
                        className="border-[#B8956A]/30"
                      />
                    </div>
                  </>
                )}

                {payoutSuccess && (
                   <Alert className="bg-green-50 border-green-200">
                     <AlertCircle className="h-4 w-4 text-green-600" />
                     <AlertDescription className="text-green-900">
                       Payout settings updated successfully!
                     </AlertDescription>
                   </Alert>
                 )}

                 {accountData?.payout_method && (
                   <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                     <h3 className="font-semibold text-blue-900 mb-2">Your Current Payout Method:</h3>
                     <p className="text-blue-800 mb-2">
                       {accountData.payout_method === "zelle" ? "Zelle" : "Bank Account"}
                     </p>
                     {accountData.payout_method === "zelle" && (
                       <p className="text-sm text-blue-700">
                         <strong>Zelle Account:</strong> {accountData.zelle_info}
                       </p>
                     )}
                     {accountData.payout_method === "bank_account" && (
                       <div className="text-sm text-blue-700 space-y-1">
                         <p><strong>Account:</strong> {accountData.bank_account_number}</p>
                         <p><strong>Routing:</strong> {accountData.bank_routing_number}</p>
                       </div>
                     )}
                   </div>
                 )}

                 <Button
                   onClick={handleUpdatePayout}
                   disabled={loading || !payoutMethod}
                   className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90"
                 >
                   {loading ? "Saving..." : "Save Payout Settings"}
                 </Button>
                </CardContent>
                </Card>

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