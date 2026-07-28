import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PoweredByFooter from "@/components/PoweredByFooter";

export default function SalesLogin() {
  const navigate = useNavigate();

  // If already logged in as sales member, redirect immediately
  // Also log out of any Base44 session to avoid conflicting identities in the header
  useEffect(() => {
    const salesId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    if (salesId) {
      const forcePw = localStorage.getItem('sales_force_password_change') || sessionStorage.getItem('sales_force_password_change');
      if (forcePw === 'true') {
        const tabHint = new URLSearchParams(window.location.search).get('tab');
        const target = createPageUrl("SalesChangePassword") + (tabHint ? `?tab=${encodeURIComponent(tabHint)}` : '');
        navigate(target, { replace: true });
      } else {
        navigate(createPageUrl("HubSpotActivityLog"), { replace: true });
      }
      return;
    }
    // Don't touch Base44 auth here — just show the login form
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Auto-login via the email button (embeds a one-time temporary password)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') !== '1') return;
    const emailParam = params.get('email');
    const pwParam = params.get('pw');
    if (!emailParam || !pwParam) return;
    const salesId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    if (salesId) return; // already logged in — the redirect effect handles it

    setAutoLoading(true);
    base44.functions.invoke('salesTeamLogin', { email: emailParam, password: pwParam })
      .then((result) => {
        if (result.data?.success) {
          const salesData = {
            sales_member_id: result.data.memberId,
            sales_member_name: result.data.name,
            sales_member_email: result.data.email,
            sales_member_role: result.data.role || 'user',
          };
          Object.entries(salesData).forEach(([k, v]) => {
            localStorage.setItem(k, v);
            sessionStorage.setItem(k, v);
          });
          sessionStorage.setItem('sales_temp_password', pwParam);
          const tabHint = params.get('tab');
          const tabSuffix = tabHint ? `?tab=${encodeURIComponent(tabHint)}&auto=1` : '?auto=1';
          if (result.data.forcePasswordChange && result.data.role !== 'admin') {
            localStorage.setItem('sales_force_password_change', 'true');
            sessionStorage.setItem('sales_force_password_change', 'true');
            navigate(createPageUrl('SalesChangePassword') + tabSuffix);
          } else {
            localStorage.removeItem('sales_force_password_change');
            sessionStorage.removeItem('sales_force_password_change');
            sessionStorage.removeItem('sales_temp_password');
            const redirectPage = result.data.role === 'admin' ? 'AdminHub' : 'HubSpotActivityLog';
            navigate(createPageUrl(redirectPage) + (tabHint ? `?tab=${encodeURIComponent(tabHint)}` : ''));
          }
        } else {
          setAutoLoading(false);
          setError(result.data?.error || "This sign-in link is no longer valid. Please sign in manually below.");
        }
      })
      .catch((err) => {
        setAutoLoading(false);
        setError(err?.data?.error || "This sign-in link is no longer valid. Please sign in manually below.");
      });
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Safari autofill doesn't always trigger onChange, so read directly from form
    const formEmail = e.target.email?.value || email;
    const formPassword = e.target.password?.value || password;

    try {
      const result = await base44.functions.invoke('salesTeamLogin', { email: formEmail, password: formPassword });
      
      if (result.data?.success) {
        const salesData = {
          sales_member_id: result.data.memberId,
          sales_member_name: result.data.name,
          sales_member_email: result.data.email,
          sales_member_role: result.data.role || 'user',
        };
        Object.entries(salesData).forEach(([k, v]) => {
          localStorage.setItem(k, v);
          sessionStorage.setItem(k, v);
        });
        const tabHint = new URLSearchParams(window.location.search).get('tab');
        const tabSuffix = tabHint ? `?tab=${encodeURIComponent(tabHint)}` : '';
        // Force a password change before anything else (newly-onboarded reps)
        if (result.data.forcePasswordChange && result.data.role !== 'admin') {
          localStorage.setItem('sales_force_password_change', 'true');
          sessionStorage.setItem('sales_force_password_change', 'true');
          navigate(createPageUrl("SalesChangePassword") + tabSuffix);
          return;
        }
        localStorage.removeItem('sales_force_password_change');
        sessionStorage.removeItem('sales_force_password_change');
        // Route admins to AdminHub, others to HubSpotActivityLog
        const redirectPage = result.data.role === 'admin' ? 'AdminHub' : 'HubSpotActivityLog';
        navigate(createPageUrl(redirectPage) + tabSuffix);
      } else {
        setError("Incorrect email or password. Please try again.");
      }
    } catch (err) {
      setError(err?.data?.error || "Incorrect email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotMsg({ type: "error", text: "Please enter your email" });
      return;
    }
    setForgotLoading(true);
    setForgotMsg(null);

    try {
      const result = await base44.functions.invoke('salesRepForgotPassword', { email: forgotEmail });
      if (result.data?.success) {
        setForgotMsg({ type: "success", text: "Password reset email sent! Check your inbox." });
        setForgotEmail("");
        setTimeout(() => setShowForgotModal(false), 2000);
      } else {
        setForgotMsg({ type: "error", text: result.data?.error || "Failed to send reset email" });
      }
    } catch (err) {
      setForgotMsg({ type: "error", text: "An error occurred" });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      {autoLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50/90">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-[#B8956A] rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-gray-600">Signing you in…</p>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center w-full">
        <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sales Team Login</CardTitle>
          <CardDescription>Sign in to access the activity log</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 items-start">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Input
                 type={showPassword ? "text" : "password"}
                 name="password"
                 autoComplete="current-password"
                 placeholder="••••••••"
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 disabled={loading}
                 required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <Dialog open={showForgotModal} onOpenChange={(open) => { setShowForgotModal(open); if (!open) setForgotMsg(null); }}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                >
                  Forgot Password?
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Enter your email and we'll send you a new password.</p>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    disabled={forgotLoading}
                  />
                  {forgotMsg && (
                    <p className={`text-sm ${forgotMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {forgotMsg.text}
                    </p>
                  )}
                  <Button
                    onClick={handleForgotPassword}
                    disabled={forgotLoading}
                    className="w-full"
                  >
                    {forgotLoading ? "Sending..." : "Send Reset Email"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </form>
        </CardContent>
      </Card>
      </div>
      <PoweredByFooter />
    </div>
  );
}