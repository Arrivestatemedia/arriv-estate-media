import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../../utils";

const ALLOWED_ROUTES_DURING_ORIENTATION = [
  "/OrientationVideo",
  "/OrientationAddress",
  "/OrientationSizes",
  "/OrientationOnboardingFee",
  "/SignIn"
];

export default function RouteGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const checkOrientation = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        
        if (!isAuth) {
          setIsAllowed(true);
          setIsChecking(false);
          return;
        }

        const user = await base44.auth.me();

        // Only apply guard to media partners
        if (user.user_type !== 'media_partner') {
          setIsAllowed(true);
          setIsChecking(false);
          return;
        }

        // Check if orientation is complete
        const orientationComplete = user.orientationCompleted && user.onboardingFeePaid;

        if (!orientationComplete) {
          // Must be on allowed route
          const currentPath = location.pathname;
          const isOnAllowedRoute = ALLOWED_ROUTES_DURING_ORIENTATION.some(route => 
            currentPath.includes(route.replace("/", ""))
          );

          if (!isOnAllowedRoute) {
            navigate(createPageUrl("OrientationVideo"), { replace: true });
            return;
          }
        }

        setIsAllowed(true);
      } catch (error) {
        console.error("Route guard error:", error);
        setIsAllowed(true);
      } finally {
        setIsChecking(false);
      }
    };

    checkOrientation();
  }, [location.pathname, navigate]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  return isAllowed ? children : null;
}