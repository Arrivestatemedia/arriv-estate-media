import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../../utils";

export default function MediaPartnerGate({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isReady, setIsReady] = useState(false);
  const [isFullyOnboarded, setIsFullyOnboarded] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const userType = localStorage.getItem('user_type');

        // Only gate media partners
        if (userType !== 'media_partner') {
          setIsReady(true);
          setIsFullyOnboarded(true);
          return;
        }

        const email = localStorage.getItem('user_email');
        if (!email) {
          setIsReady(true);
          return;
        }

        const currentPath = location.pathname;
        const orientationRoutes = ['OrientationVideo', 'OrientationSizes', 'OrientationOnboardingFee'];
        const isOnOrientationRoute = orientationRoutes.some(route => currentPath.includes(route));

        // If coming back from Stripe (payment_intent param in URL), poll until webhook fires
        const urlParams = new URLSearchParams(window.location.search);
        const isStripeReturn = urlParams.has('payment_intent');

        if (isStripeReturn) {
          // Poll up to 10 times (10 seconds) waiting for webhook to mark paid
          let attempts = 0;
          while (attempts < 10) {
            const checkResponse = await base44.functions.invoke('checkOrientationStatus', { email }).catch(() => null);
            const isComplete = checkResponse?.data?.orientationCompleted && checkResponse?.data?.onboardingFeePaid;
            if (isComplete) {
              setIsFullyOnboarded(true);
              setIsReady(true);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
          // Polling complete but not paid yet – redirect to payment
          navigate(createPageUrl('OrientationOnboardingFee'), { replace: true });
          setIsReady(true);
          return;
        }

        const checkResponse = await base44.functions.invoke('checkOrientationStatus', { email }).catch(() => null);
        const orientationCompleted = checkResponse?.data?.orientationCompleted || false;
        const onboardingFeePaid = checkResponse?.data?.onboardingFeePaid || false;

        // Already fully onboarded – let through
        if (orientationCompleted && onboardingFeePaid) {
          setIsFullyOnboarded(true);
          setIsReady(true);
          return;
        }

        // Not fully onboarded – block access unless on an orientation route
        if (!isOnOrientationRoute) {
          if (!orientationCompleted) {
            navigate(createPageUrl('OrientationVideo'), { replace: true });
          } else {
            // Orientation done but fee not paid – send to payment page (only allowed orientation route)
            navigate(createPageUrl('OrientationOnboardingFee'), { replace: true });
          }
          setIsReady(true);
          return;
        }

        // On an orientation route but not fully onboarded – allow the route
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