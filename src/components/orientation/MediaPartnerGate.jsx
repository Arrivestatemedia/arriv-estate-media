import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../../utils";

export default function MediaPartnerGate({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        
        if (!isAuth) {
          setIsReady(true);
          return;
        }

        const user = await base44.auth.me();

        // Only gate media partners
        if (user.user_type !== 'media_partner') {
          setIsReady(true);
          return;
        }

        // Check orientation completion
        const isComplete = user.orientationCompleted && user.onboardingFeePaid;
        const currentPath = location.pathname;

        // Allowed routes during orientation
        const orientationRoutes = ['/OrientationVideo', '/OrientationSizes', '/OrientationOnboardingFee'];
        const isOnOrientationRoute = orientationRoutes.some(route => currentPath.includes(route.substring(1)));

        if (!isComplete && !isOnOrientationRoute) {
          // Redirect to orientation
          navigate(createPageUrl('OrientationVideo'), { replace: true });
          return;
        }

        setIsReady(true);
      } catch (error) {
        console.error('Gate check error:', error);
        setIsReady(true);
      }
    };

    checkAccess();
  }, [location.pathname, navigate]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  return children;
}