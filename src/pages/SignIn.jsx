import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";
import { createPageUrl } from "../utils";

export default function SignIn() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Check if user exists in PendingSignup
      const signups = await base44.asServiceRole.entities.PendingSignup.filter({
        email: formData.email
      });

      if (signups.length === 0) {
        setError("Email or password incorrect");
        setLoading(false);
        return;
      }

      const signup = signups[0];

      // Verify password
      const response = await base44.functions.invoke('verifyPassword', {
        email: formData.email,
        password: formData.password,
        storedHash: signup.password_hash
      });

      if (!response.data.valid) {
        setError("Email or password incorrect");
        setLoading(false);
        return;
      }

      // Store user info in localStorage
      localStorage.setItem('user_email', signup.email);
      localStorage.setItem('user_name', signup.full_name);
      localStorage.setItem('user_type', signup.user_type);

      // Route based on user type
      if (signup.user_type === "contractor") {
        navigate(createPageUrl('ContractorDashboard'));
      } else {
        navigate(createPageUrl('BookingPage'));
      }
    } catch (err) {
      console.error('Login error:', err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <LogIn className="w-8 h-8 text-[#B8956A]" />
          </div>
          <CardTitle className="text-2xl text-[#1A1A1A]">Log In</CardTitle>
          <p className="text-[#1A1A1A]/60 mt-2">
            Sign in to your Arriv Estate Media account
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Email Address
              </label>
              <Input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Password
              </label>
              <Input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="Your password"
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
              {loading ? "Logging in..." : "Log In"}
            </Button>
            <div className="space-y-2">
              <p className="text-center text-sm text-[#1A1A1A]/60">
                Don't have an account?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(createPageUrl('CustomerSignup'))}
                >
                  Customer Sign Up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(createPageUrl('ContractorSignup'))}
                >
                  Contractor Sign Up
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}