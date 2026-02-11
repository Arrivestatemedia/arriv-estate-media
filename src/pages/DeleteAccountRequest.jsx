import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle } from "lucide-react";

export default function DeleteAccountRequest() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await base44.functions.invoke("requestAccountDeletion", {
        email: email.toLowerCase(),
      });
      setSuccess(true);
      setEmail("");
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || err.message || "Failed to process request";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-[#1A1A1A]">
            Delete Account
          </CardTitle>
          <p className="text-[#1A1A1A]/60 mt-2 text-sm">
            Enter your email to request account deletion
          </p>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900">Request Received</p>
                  <p className="text-sm text-green-800 mt-1">
                    Your account will be deleted in 30 days. Check your email for a link to delete immediately.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setSuccess(false)}
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
              >
                Go Back
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? "Processing..." : "Request Deletion"}
              </Button>
              <p className="text-center text-xs text-[#1A1A1A]/60">
                This cannot be undone. Your account and all data will be permanently deleted.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}