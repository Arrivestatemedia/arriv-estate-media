import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { createPageUrl } from "../utils";

export default function SignIn() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    // Check if user is already logged in
    const userEmail = localStorage.getItem('user_email');
    const userType = localStorage.getItem('user_type');
    
    if (userEmail && userType) {
      // User is logged in, redirect to their dashboard
      if (userType === "media_partner") {
        window.location.href = '/MediaPartnerDashboard';
      } else {
        window.location.href = '/BookingPage';
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Invoke backend function to verify user
      const response = await base44.functions.invoke('verifySignIn', {
        email: formData.email.toLowerCase(),
        password: formData.password
      });

      if (!response.data.success) {
        setError(response.data.error || "Email or password incorrect");
        localStorage.clear();
        setLoading(false);
        return;
      }

      // Store user info in localStorage AND sessionStorage (Safari fallback)
      const userData = {
        user_email: response.data.email,
        user_name: response.data.full_name,
        user_type: response.data.user_type,
        user_role: response.data.user_role,
        user_phone: response.data.phone_number,
      };
      Object.entries(userData).forEach(([k, v]) => {
        localStorage.setItem(k, v);
        sessionStorage.setItem(k, v);
      });

      // Track first login for media partners
      if (response.data.user_type === 'media_partner' && !response.data.hasLoggedInBefore) {
        base44.analytics.track({
          eventName: 'first_media_partner_login',
          properties: { userId: response.data.id }
        });
      }

      // Route based on user type and orientation status
      if (response.data.user_role === 'admin') {
        window.location.href = '/Dashboard';
      } else if (response.data.user_type === 'media_partner') {
        // Check if orientation is complete
        if (!response.data.orientationCompleted || !response.data.onboardingFeePaid) {
          window.location.href = '/OrientationVideo';
        } else {
          window.location.href = '/MediaPartnerDashboard';
        }
      } else {
        window.location.href = '/BookingPage';
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
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="border-[#B8956A]/30 focus:border-[#B8956A] pr-10"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#1A1A1A]/50 hover:text-[#1A1A1A]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-[#B8956A] hover:text-[#B8956A]/80 hover:bg-transparent p-0 h-auto"
                  onClick={() => window.location.href = '/ForgotPassword'}
                >
                  Forgot password?
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-[#B8956A] hover:text-[#B8956A]/80 hover:bg-transparent p-0 h-auto"
                  onClick={() => window.location.href = '/ForgotEmail'}
                >
                  Forgot email?
                </Button>
              </div>
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

          </form>
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#B8956A]/40 text-[#B8956A] hover:bg-[#B8956A]/10"
              onClick={() => navigate(createPageUrl("ApplicationPortal"))}
            >
              Check Application Status
            </Button>
          </div>
          </CardContent>
      </Card>
    </div>
  );
}