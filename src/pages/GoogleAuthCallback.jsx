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

        const { success, needsSignup, email, full_name, user_type, user_role } = response.data;

        if (!success) {
          // User doesn't exist - needs to sign up
          if (needsSignup) {
            const signupPage = userType === "media_partner" ? "MediaPartnerSignup" : "ClientSignup";
            localStorage.setItem("google_signup_data", JSON.stringify({
              email,
              full_name,
              userType,
            }));
            window.location.href = createPageUrl(signupPage);
          } else {
            window.location.href = createPageUrl("SignIn");
          }
          return;
        }

        // User exists - log them in
        localStorage.setItem("user_email", email);
        localStorage.setItem("user_name", full_name);
        localStorage.setItem("user_type", user_type);
        localStorage.setItem("user_role", user_role);

        // Redirect to appropriate dashboard
        if (user_role === "admin") {
          window.location.href = createPageUrl("Dashboard");
        } else if (user_type === "client") {
          window.location.href = createPageUrl("BookingPage");
        } else {
          window.location.href = createPageUrl("MediaPartnerDashboard");
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