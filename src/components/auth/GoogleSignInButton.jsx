import React, { useState } from "react";
import { Button } from "@/components/ui/button";

export default function GoogleSignInButton({ onPhoneNumberNeeded, userType, disabled = false }) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        console.error("Google Client ID not configured");
        return;
      }

      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const scope = "openid profile email";
      const responseType = "code";

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        scope: scope,
        state: btoa(JSON.stringify({ userType }))
      }).toString()}`;

      // Store redirect info in sessionStorage
      sessionStorage.setItem("oauth_redirect_usertype", userType);
      window.location.href = authUrl;
    } catch (error) {
      console.error("Google Sign-In error:", error);
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleGoogleSignIn}
      disabled={loading || disabled}
      className="w-full bg-white hover:bg-gray-50 text-[#1A1A1A] border border-[#1A1A1A]/20"
    >
      {loading ? "Signing in..." : "Sign in with Google"}
    </Button>
  );
}