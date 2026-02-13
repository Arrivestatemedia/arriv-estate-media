import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await base44.functions.invoke('sendForgotPasswordEmail', {
        email: email
      });

      if (response.data.success) {
        setSubmitted(true);
      } else {
        setError(response.data.error || "Failed to send password reset email.");
      }
    } catch (err) {
      console.error('Error:', err);
      setError("Failed to send password reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-[#B8956A]" />
          </div>
          <CardTitle className="text-2xl text-[#1A1A1A]">Reset Password</CardTitle>
          <p className="text-[#1A1A1A]/60 mt-2">
            Enter your email and we'll send you your password
          </p>
        </CardHeader>
        <CardContent>
          {!submitted ? (
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
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
              >
                {loading ? "Sending..." : "Send Password Reset"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-[#B8956A] hover:text-[#B8956A]/80 hover:bg-transparent"
                onClick={() => window.location.href = '/SignIn'}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">Check your email!</p>
                <p className="text-green-700 text-sm mt-1">
                  We've sent your password to {email}. Please check your inbox.
                </p>
              </div>
              <Button
                type="button"
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
                onClick={() => window.location.href = '/SignIn'}
              >
                Back to Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}