import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { createPageUrl } from "../utils";


export default function MediaPartnerSignup() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const roleFromUrl = urlParams.get('role') || 'user';
  
  const prefilledFullName = urlParams.get('full_name') || "";
  const prefilledEmail = urlParams.get('email') || "";
  const prefilledPhone = urlParams.get('phone_number') || "";
  const isPrefilled = Boolean(prefilledFullName || prefilledEmail);

  const [formData, setFormData] = useState(() => {
    if (isPrefilled) {
      return {
        full_name: prefilledFullName,
        email: prefilledEmail,
        phone_number: prefilledPhone,
        password: "",
        password_confirmation: ""
      };
    }
    const saved = localStorage.getItem('mediaPartnerSignupFormData');
    return saved ? JSON.parse(saved) : { 
      email: "", 
      full_name: "", 
      phone_number: prefilledPhone,
      password: "",
      password_confirmation: ""
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    localStorage.setItem('mediaPartnerSignupFormData', JSON.stringify(formData));
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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
        const params = new URLSearchParams({ email: formData.email, full_name: formData.full_name });
        window.location.href = `/MediaPartnerTermsConditions?${params.toString()}`;
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
          {isPrefilled && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3 text-left">
              Welcome back! Your details from your application have been pre-filled. Just set your password to continue.
            </p>
          )}
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
                readOnly={isPrefilled}
                className={`border-[#B8956A]/30 focus:border-[#B8956A] ${isPrefilled ? "bg-gray-100 text-[#1A1A1A]/70 cursor-not-allowed" : ""}`}
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
                readOnly={isPrefilled}
                className={`border-[#B8956A]/30 focus:border-[#B8956A] ${isPrefilled ? "bg-gray-100 text-[#1A1A1A]/70 cursor-not-allowed" : ""}`}
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
                readOnly={isPrefilled}
                className={`border-[#B8956A]/30 focus:border-[#B8956A] ${isPrefilled ? "bg-gray-100 text-[#1A1A1A]/70 cursor-not-allowed" : ""}`}
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

            <Button
              type="submit"
              disabled={loading}
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