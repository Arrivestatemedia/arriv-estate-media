import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Check } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function PasswordSetup() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError("Invalid setup link");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke("completeSignup", {
        token,
        password,
      });

      setEmail(response.data.email);
      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate(createPageUrl("JobBoard"));
      }, 3000);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to set up account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white border-[#B8956A]/20">
        <CardHeader className="border-b border-[#B8956A]/20">
          <CardTitle className="text-2xl font-bold text-center text-[#1A1A1A]">
            Set Your Password
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <Check className="w-12 h-12 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-[#1A1A1A]">
                Account Created!
              </h3>
              <p className="text-sm text-gray-600">
                Your account is ready. Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#1A1A1A]">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="border-[#B8956A]/20 focus:border-[#B8956A]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[#1A1A1A]">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="border-[#B8956A]/20 focus:border-[#B8956A]"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#B8956A] hover:bg-[#B8956A]/90 text-white"
              >
                {loading ? "Setting up account..." : "Create Account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}