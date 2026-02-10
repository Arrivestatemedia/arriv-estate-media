import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function ConfirmDeleteUser() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading");
  const userId = searchParams.get("user_id");

  useEffect(() => {
    if (!userId) {
      setStatus("error");
      return;
    }

    // The actual deletion is handled by the backend function
    // This page just shows a confirmation message
    fetch(`/api/functions/confirmDeleteUser?user_id=${userId}`)
      .then(response => {
        if (response.ok) {
          setStatus("success");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [userId]);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          {status === "loading" && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#B8956A] animate-spin" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">Processing...</CardTitle>
            </>
          )}
          {status === "success" && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">Account Deleted</CardTitle>
            </>
          )}
          {status === "error" && (
            <>
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-[#1A1A1A]">Error</CardTitle>
            </>
          )}
        </CardHeader>
        <CardContent className="text-center">
          {status === "loading" && (
            <p className="text-[#1A1A1A]/60">Deleting user account...</p>
          )}
          {status === "success" && (
            <p className="text-[#1A1A1A]/60">The user account has been permanently deleted.</p>
          )}
          {status === "error" && (
            <p className="text-[#1A1A1A]/60">Failed to delete account. Please check the link and try again.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}