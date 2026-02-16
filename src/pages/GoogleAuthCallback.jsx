import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../utils";

export default function GoogleAuthCallback() {
  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");

        if (!code) {
          console.error("No authorization code received");
          window.location.href = createPageUrl("SignIn");
          return;
        }

        // Decode the state to get userType
        let userType = "client";
        if (state) {
          try {
            const stateData = JSON.parse(atob(state));
            userType = stateData.userType || "client";
          } catch (e) {
            console.log("Could not parse state");
          }
        }

        // Also check sessionStorage as fallback
        const sessionUserType = sessionStorage.getItem("oauth_redirect_usertype");
        if (sessionUserType) {
          userType = sessionUserType;
          sessionStorage.removeItem("oauth_redirect_usertype");
        }

        // Call backend to exchange code for tokens
        const response = await base44.functions.invoke("handleGoogleCallback", {
          code,
          userType,
        });

        const { email, full_name, pendingSignup } = response.data;

        // Store user info in localStorage
        localStorage.setItem("user_email", email);
        localStorage.setItem("user_name", full_name);
        localStorage.setItem("user_type", userType);

        // If user is signing in (not signing up), redirect to dashboard
        if (userType === "signin" || userType === "client") {
          // For existing users, check if they need phone number
          if (userType === "client" && pendingSignup?.phone_number) {
            // They have a phone number already, proceed to dashboard
            window.location.href = createPageUrl("BookingPage");
          } else if (userType === "media_partner" && pendingSignup?.phone_number) {
            // Media partner with phone number
            window.location.href = createPageUrl("MediaPartnerDashboard");
          } else if (userType === "signin") {
            // Signing in
            window.location.href = createPageUrl("Dashboard");
          } else {
            // New signup needs phone number - redirect to appropriate signup with Google data
            const signupPage = userType === "client" ? "ClientSignup" : "MediaPartnerSignup";
            localStorage.setItem("google_signup_data", JSON.stringify({
              email,
              full_name,
              userType,
              ...pendingSignup,
            }));
            window.location.href = createPageUrl(signupPage);
          }
        }
      } catch (error) {
        console.error("Google auth callback error:", error);
        window.location.href = createPageUrl("SignIn");
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B8956A] mx-auto mb-4"></div>
        <p className="text-[#1A1A1A]/70">Completing sign in...</p>
      </div>
    </div>
  );
}