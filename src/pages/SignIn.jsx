import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { createPageUrl } from "../utils";
import { saveCustomerSession, saveCustomerIdentity, getCustomerSessionToken, isConfirmedSessionFailure } from "@/lib/customerSession";
import { loadCustomerAccount } from '@/lib/customerAccount';

export default function SignIn() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const redirectPage = urlParams.get('redirect');
  const redirectJobId = urlParams.get('jobId');

  // Where to go once signed in. A screen that had to renew the session sends ?redirect=<path>, so
  // the customer lands back where they were instead of being bounced to the booking form.
  const returnTo = (() => {
    const raw = String(redirectPage || '').trim();
    if (!raw) return '';
    const path = raw.startsWith('/') ? raw : `/${raw}`;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /signin|saleslogin/i.test(path)) return '';
    if (redirectJobId && !path.includes('jobId')) {
      return `${path}${path.includes('?') ? '&' : '?'}jobId=${encodeURIComponent(redirectJobId)}`;
    }
    return path;
  })();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(() => !!getCustomerSessionToken());

  React.useEffect(() => {
    if (!getCustomerSessionToken()) return;
    let cancelled = false;
    loadCustomerAccount().then((account) => {
      if (cancelled) return;
      window.location.replace(returnTo || (account.role === 'admin' ? '/Dashboard'
        : account.user_type === 'media_partner' ? '/MediaPartnerDashboard' : '/ClientBookings'));
    }).catch((err) => {
      if (!cancelled && !isConfirmedSessionFailure(err)) setError('We could not check your existing session. Please retry or sign in below.');
    }).finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
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
        // A failed credential attempt must not erase another valid customer or sales session.
        setLoading(false);
        return;
      }

      // Do not report login success unless the credential is persisted AND accepted
      // by the same server guard the customer's pages use.
      if (!saveCustomerSession(response.data)) throw new Error('Your session could not be saved. Please allow browser storage and try again.');
      const account = await loadCustomerAccount();
      saveCustomerIdentity({ ...account, user_role: response.data.user_role });

      // Track first login for media partners
      if (response.data.user_type === 'media_partner' && !response.data.hasLoggedInBefore) {
        base44.analytics.track({
          eventName: 'first_media_partner_login',
          properties: { userId: response.data.id }
        });
      }

      // Clear any stale sales-team session so the correct nav shows for THIS login.
      // Without this, a prior sales login on the same browser would cause Layout.jsx
      // to show the sales rep nav for clients and media partners.
      ['sales_member_id', 'sales_member_name', 'sales_member_email', 'sales_member_role', 'sales_force_password_change', 'sales_session_token'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });

      // A return path always wins, so a session renewal lands on the screen that asked for it.
      if (returnTo) {
        window.location.href = returnTo;
        return;
      }

      // Route based on user type and orientation status
      if (response.data.user_role === 'admin') {
        window.location.href = '/Dashboard';
      } else if (response.data.user_type === 'media_partner') {
        // Check if orientation is complete
        if (!response.data.orientationCompleted) {
          window.location.href = '/OrientationVideo';
        } else {
          window.location.href = '/MediaPartnerDashboard';
        }
      } else {
        // Client — honor delivery redirect if present
        if (redirectPage && redirectJobId) {
          window.location.href = `/${redirectPage}?jobId=${redirectJobId}`;
        } else {
          window.location.href = '/ClientBookings';
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err?.response?.data?.error || err?.data?.error || err?.message || 'Login failed. Please try again.');
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
              disabled={loading || checkingSession}
              className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
            >
              {checkingSession ? 'Checking session...' : loading ? 'Logging in...' : 'Log In'}
            </Button>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}