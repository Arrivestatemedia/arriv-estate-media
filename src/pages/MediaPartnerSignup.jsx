import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Briefcase } from "lucide-react";
import { createPageUrl } from "../utils";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import PhoneNumberModal from "@/components/auth/PhoneNumberModal";


export default function MediaPartnerSignup() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get('role') || 'user';
  
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('mediaPartnerSignupFormData');
    return saved ? JSON.parse(saved) : { 
      email: "", 
      full_name: "", 
      phone_number: urlParams.get('phone_number') || "",
      password: "",
      password_confirmation: ""
    };
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(() => localStorage.getItem('mediaPartnerTermsScrolled') === 'true');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [googlePhoneData, setGooglePhoneData] = useState(null);

  React.useEffect(() => {
    localStorage.setItem('mediaPartnerSignupFormData', JSON.stringify(formData));
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
      const response = await base44.functions.invoke('signupMediaPartner', {
        email: formData.email,
        full_name: formData.full_name,
        phone_number: formData.phone_number,
        password: formData.password,
        user_type: "media_partner",
        user_role: roleFromUrl
      });
      
      if (response.data?.success) {
        localStorage.removeItem('mediaPartnerSignupFormData');
        localStorage.removeItem('mediaPartnerTermsScrolled');
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
            <Briefcase className="w-8 h-8 text-[#B8956A]" />
          </div>
          <CardTitle className="text-2xl text-[#1A1A1A]">Join Our Team</CardTitle>
          <p className="text-[#1A1A1A]/60 mt-2">
            Sign up to become a media partner and start taking jobs
          </p>
        </CardHeader>
        <CardContent>
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
                placeholder="John Doe"
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
                placeholder="john@example.com"
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
              <div className="flex items-start gap-3 p-3 bg-[#B8956A]/5 rounded-lg border border-[#B8956A]/20">
                <Checkbox
                  id="terms"
                  checked={termsScrolled && termsAccepted}
                  onCheckedChange={(checked) => {
                    if (termsScrolled) {
                      setTermsAccepted(checked);
                    }
                  }}
                  disabled={!termsScrolled}
                  className="mt-1"
                />
                <label htmlFor="terms" className="text-xs text-[#1A1A1A]/70 cursor-pointer leading-relaxed">
                  I confirm that I have read, understand, and agree to the{" "}
                  <Link 
                    to="/MediaPartnerTermsConditions"
                    className="text-[#B8956A] font-medium hover:underline"
                  >
                    Media Partner Terms & Conditions
                  </Link>
                  . I acknowledge that I am an independent contractor and agree to comply with all access, confidentiality, and non-circumvention requirements.
                </label>
              </div>
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

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#1A1A1A]/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-[#1A1A1A]/60">Or</span>
              </div>
            </div>

            <GoogleSignInButton userType="media_partner" />

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
      <PhoneNumberModal 
        open={showPhoneModal} 
        onClose={() => {
          setShowPhoneModal(false);
          setGooglePhoneData(null);
        }} 
        onSubmit={async (phoneNumber) => {
          if (googlePhoneData) {
            setLoading(true);
            try {
              const response = await base44.functions.invoke('signupMediaPartner', {
                email: googlePhoneData.email,
                full_name: googlePhoneData.full_name,
                phone_number: phoneNumber,
                password: googlePhoneData.password,
                user_type: "media_partner",
                user_role: 'user'
              });
              
              if (response.data?.success) {
                localStorage.removeItem('mediaPartnerSignupFormData');
                localStorage.removeItem('mediaPartnerTermsScrolled');
                localStorage.setItem('user_email', response.data.email);
                localStorage.setItem('user_name', response.data.full_name);
                localStorage.setItem('user_type', 'media_partner');
                localStorage.setItem('user_role', response.data.user_role);
                localStorage.setItem('user_phone', phoneNumber);
                window.location.href = createPageUrl('MediaPartnerDashboard');
              } else {
                setError(response.data?.error || "Signup failed");
                setLoading(false);
              }
            } catch (err) {
              console.error('Signup error:', err);
              setError(err.response?.data?.error || "Signup failed");
              setLoading(false);
            }
          }
        }} 
        loading={loading} 
      />
      </div>
    );
  }