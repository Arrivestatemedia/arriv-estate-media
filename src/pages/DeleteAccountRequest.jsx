import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle, ChevronLeft } from "lucide-react";

export default function AccountSettings() {
  const [step, setStep] = useState("lookup"); // lookup, edit, delete-confirm, delete-success
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountData, setAccountData] = useState(null);

  const handleLookup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await base44.functions.invoke("lookupAccount", {
        email: email.toLowerCase(),
      });
      setAccountData(response.data);
      setNewEmail(response.data.email);
      setPhoneNumber(response.data.phone_number);
      setStep("edit");
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || "Account not found";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await base44.functions.invoke("updateAccountDetails", {
        accountId: accountData.id,
        email: newEmail.toLowerCase(),
        phoneNumber,
      });
      setAccountData({ ...accountData, email: newEmail, phone_number: phoneNumber });
      setError("");
      alert("Account updated successfully");
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || "Failed to update account";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletion = async () => {
    setLoading(true);
    setError("");

    try {
      await base44.functions.invoke("requestAccountDeletion", {
        email: accountData.email,
      });
      setStep("delete-success");
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || "Failed to process request";
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        {/* Lookup Step */}
        {step === "lookup" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Account Settings
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2 text-sm">
                Enter your email to access your account
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Email Address
                  </label>
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
                  className="w-full bg-[#B8956A] hover:bg-[#B8956A]/90 text-white"
                >
                  {loading ? "Looking up..." : "Continue"}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {/* Edit Step */}
        {step === "edit" && (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Update Account
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2 text-sm">
                {accountData?.full_name}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleUpdateAccount} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="border-[#B8956A]/30 focus:border-[#B8956A]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Phone Number
                  </label>
                  <Input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="border-[#B8956A]/30 focus:border-[#B8956A]"
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
                  className="w-full bg-[#B8956A] hover:bg-[#B8956A]/90 text-white"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              </form>

              <div className="border-t border-[#B8956A]/20 pt-4">
                <p className="text-xs font-medium text-red-600 mb-3">DANGER ZONE</p>
                <Button
                  onClick={() => setStep("delete-confirm")}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  Request Account Deletion
                </Button>
              </div>

              <Button
                onClick={() => setStep("lookup")}
                variant="ghost"
                className="w-full"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </CardContent>
          </>
        )}

        {/* Delete Confirm Step */}
        {step === "delete-confirm" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Delete Account?
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2 text-sm">
                Your account will be deleted in 30 days. You'll receive an email with a link to delete immediately.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleRequestDeletion}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? "Processing..." : "Request Deletion"}
              </Button>
              <Button
                onClick={() => setStep("edit")}
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </>
        )}

        {/* Delete Success Step */}
        {step === "delete-success" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Request Received
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2 text-sm">
                Your account will be deleted in 30 days. Check your email for a link to delete immediately.
              </p>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setStep("lookup")}
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
              >
                Go Back
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}