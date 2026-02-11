import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function ConfirmDeleteAccount() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const email = params.get("email");

    if (!token || !email) {
      setError("Invalid deletion link");
      setLoading(false);
      return;
    }

    const deleteAccount = async () => {
      try {
        await base44.functions.invoke("immediateDeleteAccount", {
          token,
          email,
        });
        setSuccess(true);
      } catch (err) {
        const errorMessage =
          err.response?.data?.error || "Failed to delete account";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    deleteAccount();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          {loading && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Processing
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2">Deleting account...</p>
            </>
          )}
          {success && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">
                Account Deleted
              </CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2">
                Your account has been permanently deleted
              </p>
            </>
          )}
          {error && !loading && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">Error</CardTitle>
              <p className="text-[#1A1A1A]/60 mt-2">{error}</p>
            </>
          )}
        </CardHeader>
        <CardContent>
          {success && (
            <Button
              onClick={() => (window.location.href = "/")}
              className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
            >
              Return Home
            </Button>
          )}
          {error && !loading && (
            <Button
              onClick={() => (window.location.href = "/")}
              className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
            >
              Go Back
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}