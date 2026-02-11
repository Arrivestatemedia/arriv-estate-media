import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPageUrl } from "../utils";
import { Mail, Check, AlertCircle } from "lucide-react";

export default function AdminInvite() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    base44.auth.me().then((userData) => {
      if (userData?.role !== 'admin') {
        window.location.href = createPageUrl('Dashboard');
      } else {
        setUser(userData);
      }
    }).catch(() => {
      window.location.href = createPageUrl('Dashboard');
    });
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await base44.users.inviteUser(email, role);
      setMessage({ type: 'success', text: `Invitation sent to ${email}` });
      setEmail("");
      setRole("user");
    } catch (err) {
      setMessage({ type: 'error', text: err.message || "Failed to send invitation" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="border-2 border-[#B8956A]/20">
          <CardHeader>
            <CardTitle className="text-2xl text-[#1A1A1A]">Invite User</CardTitle>
            <p className="text-[#1A1A1A]/60 mt-2">Send an invitation to join the platform</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-[#B8956A]" />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-[#B8956A]/30 focus:border-[#B8956A]"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                  Role
                </label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="border-[#B8956A]/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span className="text-sm">{message.text}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
              >
                {loading ? "Sending..." : "Send Invitation"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}