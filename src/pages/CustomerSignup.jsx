import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, CheckCircle2 } from "lucide-react";

export default function CustomerSignup() {
  const [searchParams] = useSearchParams();
  const phoneNumber = searchParams.get('phone_number');
  const [formData, setFormData] = useState({ email: "", full_name: "", phone_number: phoneNumber || "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await base44.functions.invoke('signupCustomer', formData);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-2 border-[#B8956A]/20">
          <CardContent className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">Check Your Email!</h2>
            <p className="text-[#1A1A1A]/60">
              We've sent you an invitation link. Check your inbox to complete registration and book your shoot.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                Full Name
              </label>
              <Input
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
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
                placeholder="+1 (555) 123-4567"
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
              {loading ? "Sending Invitation..." : "Sign Up to Book"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}