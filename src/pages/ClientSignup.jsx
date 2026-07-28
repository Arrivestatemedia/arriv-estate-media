import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Lock } from "lucide-react";
import { createPageUrl } from "../utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addOnNames } from "@/lib/services";


export default function ClientSignup() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get('role') || 'user';
  const inviteToken = urlParams.get('invite');
  
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('clientSignupFormData');
    return saved ? JSON.parse(saved) : {
      email: "", 
      full_name: "", 
      phone_number: urlParams.get('phone_number') || "",
      password: "",
      password_confirmation: "",
      sales_member_id: ""
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [salesReps, setSalesReps] = useState([]);

  React.useEffect(() => {
    if (!inviteToken) return;
    base44.functions.invoke('getSignupInvite', { token: inviteToken })
      .then(res => {
        const inv = res?.data;
        if (inv && inv.package) {
          setInvite(inv);
          setFormData(prev => ({
            ...prev,
            full_name: inv.client_name || prev.full_name,
            email: inv.client_email || prev.email,
            phone_number: inv.client_phone || prev.phone_number,
            sales_member_id: inv.sales_member_id || prev.sales_member_id,
          }));
        }
      })
      .catch(err => console.error('Invite load error:', err));
  }, [inviteToken]);
  React.useEffect(() => {
    base44.functions.invoke('listSalesReps', {}).then(res => setSalesReps(res?.data?.reps || [])).catch(() => {});
  }, []);

  const [termsScrolled, setTermsScrolled] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [smsConsented, setSmsConsented] = useState(false);

  React.useEffect(() => {
    const scrolled = localStorage.getItem('clientTermsScrolled') === 'true';
    if (scrolled) {
      setTermsScrolled(true);
      localStorage.removeItem('clientTermsScrolled');
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem('clientSignupFormData', JSON.stringify(formData));
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate terms acceptance
     if (!termsAccepted) {
       setError("You must accept the Terms & Conditions to continue");
       setLoading(false);
       return;
     }

    // Validate passwords match
    if (formData.password !== formData.password_confirmation) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const response = await base44.functions.invoke('signupClient', {
        email: formData.email,
        full_name: formData.full_name,
        phone_number: formData.phone_number,
        password: formData.password,
        user_type: "client",
        user_role: roleFromUrl,
        invite_token: inviteToken || undefined,
      });
      
      if (response.data?.success) {
        localStorage.removeItem('clientSignupFormData');
        if (inviteToken) localStorage.setItem('pending_invite_token', inviteToken);
        if (!inviteToken && formData.sales_member_id) {
          localStorage.setItem('selected_sales_member_id', formData.sales_member_id);
          const rep = salesReps.find(r => r.id === formData.sales_member_id);
          if (rep) localStorage.setItem('selected_sales_member_name', rep.full_name);
        }
        window.location.href = createPageUrl('SignIn');
      } else {
        setError(response.data?.error || "Failed to create account");
        setLoading(false);
      }
    } catch (err) {
      console.error('Signup error:', err);
      const errorMessage = err.response?.data?.error || err.message || "Failed to create account";
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Camera className="w-8 h-8 text-[#B8956A]" />
          </div>
          <CardTitle className="text-2xl text-[#1A1A1A]">Book Your Shoot</CardTitle>
          <p className="text-[#1A1A1A]/60 mt-2">
            Sign up to access our professional real estate media services
          </p>
        </CardHeader>
        <CardContent>
          {invite && (
            <div className="mb-4 rounded-lg border-2 border-[#B8956A]/40 bg-[#B8956A]/10 p-4 space-y-2">
              <p className="text-sm font-semibold text-[#B8956A]">
                {invite.sales_member_name ? `${invite.sales_member_name} prepared a package for you` : 'Your sales rep prepared a package for you'}
              </p>
              <div className="text-sm text-[#1A1A1A]/80 space-y-1">
                <p><span className="font-medium">Package:</span> {invite.package_name || invite.package}</p>
                {invite.locked_add_ons && invite.locked_add_ons.length > 0 && (
                  <p><span className="font-medium">Included add-ons:</span> {invite.locked_add_ons.map(id => addOnNames[id] || id).join(', ')}</p>
                )}
              </div>
              <p className="text-xs text-[#1A1A1A]/60">
                Your info is pre-filled. After you create your account and sign in, your package will be ready — you can add more services, but contact your rep to remove anything.
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Full Name
              </label>
              <Input
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="Jane Smith"
              />
            </div>
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
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Phone Number
              </label>
              <Input
                type="tel"
                inputMode="tel"
                required
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Who did you work with?
              </label>
              {invite ? (
                <div className="flex items-center gap-2 rounded-md border border-[#B8956A]/30 bg-[#B8956A]/5 px-3 py-2.5 text-sm text-[#1A1A1A]/70">
                  <span className="flex-1">{invite.sales_member_name || 'Your sales rep'}</span>
                  <Lock className="w-4 h-4 text-[#B8956A]" />
                </div>
              ) : (
                <Select
                  value={formData.sales_member_id || '__none__'}
                  onValueChange={(v) => setFormData({ ...formData, sales_member_id: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger className="border-[#B8956A]/30 focus:border-[#B8956A]">
                    <SelectValue placeholder="Select your sales rep (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No one / I found you myself</SelectItem>
                    {salesReps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-[#1A1A1A]/50 mt-1">So we can credit your sales rep's commission.</p>
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
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Confirm Password
              </label>
              <Input
                type="password"
                required
                value={formData.password_confirmation}
                onChange={(e) => setFormData({ ...formData, password_confirmation: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="Confirm your password"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs text-[#1A1A1A]/70 cursor-pointer leading-relaxed flex items-start gap-2 p-3 bg-[#B8956A]/5 rounded-lg border border-[#B8956A]/20">
                <Checkbox
                  checked={smsConsented}
                  onCheckedChange={setSmsConsented}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  I would like to receive optional SMS updates from Arriv Estate Media LLC about my bookings (including confirmations, scheduling updates, arrival notifications, job completion notices, invoices, and payment reminders). Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. SMS consent is not required to create an account or use our services.
                </span>
              </label>
              <p className="text-xs text-[#1A1A1A]/50 px-1">
                For support, contact <a href="mailto:support@arrivestatemedia.com" className="text-[#B8956A] hover:underline">support@arrivestatemedia.com</a>
              </p>

              <label className="text-xs text-[#1A1A1A]/70 cursor-pointer leading-relaxed flex items-center gap-2 p-3 bg-[#B8956A]/5 rounded-lg border border-[#B8956A]/20">
                <Checkbox
                  checked={termsScrolled && termsAccepted}
                  onCheckedChange={(checked) => {
                    if (termsScrolled) {
                      setTermsAccepted(checked);
                    }
                  }}
                  disabled={!termsScrolled}
                />
                <span>
                  I confirm that I have read and agree to the{" "}
                  <Link 
                    to="/ClientTermsConditions" 
                    className="text-[#B8956A] font-medium hover:underline"
                  >
                    ARRIV Estate Media Client Terms & Conditions
                  </Link>
                  , including pricing, usage rights, and delivery policies.
                </span>
              </label>
              {!termsScrolled && (
                <p className="text-xs text-red-600 px-3">
                  Please read the Terms & Conditions first
                </p>
              )}
            </div>

            <Button
               type="submit"
               disabled={loading || !termsAccepted}
               className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white disabled:bg-[#1A1A1A]/50 disabled:cursor-not-allowed"
             >
              {loading ? "Creating Account..." : "Sign Up"}
            </Button>
            <p className="text-center text-sm text-[#1A1A1A]/60">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => window.location.href = '/SignIn'}
                className="text-[#B8956A] hover:underline font-medium"
              >
                Log In
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
      </div>
      );
      }