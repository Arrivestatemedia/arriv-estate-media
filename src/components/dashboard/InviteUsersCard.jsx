import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";

export default function InviteUsersCard() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState("client");
  const [userRole, setUserRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSend = async () => {
    if (!phoneNumber || (userRole === "test_user" && !email)) return;
    
    setLoading(true);
    setStatus(null);

    try {
      // Create test user if role is "test_user"
      if (userRole === "test_user") {
        const testUserResponse = await base44.functions.invoke('createTestUser', {
          phone_number: phoneNumber,
          email: email,
          user_type: userType,
          user_role: "user"
        });
        if (!testUserResponse?.data?.success) {
          throw new Error(testUserResponse?.data?.error || "Failed to create test user");
        }
      }

      // Send SMS with signup link
      const smsResponse = await base44.functions.invoke('sendSignupSMS', {
        phone_number: phoneNumber,
        user_type: userType,
        user_role: userRole === "test_user" ? "user" : userRole
      });
      if (!smsResponse?.data?.success) {
        throw new Error(smsResponse?.data?.error || "Failed to send SMS");
      }

      setStatus({ type: "success", message: "Invitation sent successfully!" });
      setPhoneNumber("");
      setEmail("");
    } catch (error) {
      console.error('Error:', error);
      setStatus({ 
        type: "error", 
        message: error.response?.data?.error || error.message || "Failed to send invitation" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#B8956A]" />
          Send Signup Invitation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
            Phone Number
          </label>
          <Input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="border-[#B8956A]/30 focus:border-[#B8956A]"
          />
        </div>

        {userRole === "test_user" && (
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
              Email Address
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
              className="border-[#B8956A]/30 focus:border-[#B8956A]"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
            User Type
          </label>
          <Select value={userType} onValueChange={setUserType}>
            <SelectTrigger className="border-[#B8956A]/30 focus:border-[#B8956A]">
              <SelectValue>{userType === 'client' ? 'Client' : 'Media Partner'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="media_partner">Media Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
            User Role
          </label>
          <Select value={userRole} onValueChange={setUserRole}>
            <SelectTrigger className="border-[#B8956A]/30 focus:border-[#B8956A]">
              <SelectValue>{userRole === 'user' ? 'Regular User' : userRole === 'admin' ? 'Admin' : 'Test User'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Regular User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="test_user">Test User</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {status && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            status.type === "success" 
              ? "bg-green-50 text-green-700" 
              : "bg-red-50 text-red-700"
          }`}>
            {status.type === "success" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {status.message}
          </div>
        )}

        <Button
          onClick={handleSend}
          disabled={loading || !phoneNumber || (userRole === "test_user" && !email)}
          className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
        >
          {loading ? "Sending..." : "Send Invitation"}
        </Button>
      </CardContent>
    </Card>
  );
}