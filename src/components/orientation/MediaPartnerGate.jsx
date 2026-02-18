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

        const urlParams = new URLSearchParams(window.location.search);
        const isPaymentSuccess = urlParams.get('payment_success') === 'true';

        // If coming back from Stripe payment, confirm it immediately
        if (isPaymentSuccess) {
          try {
            await base44.functions.invoke('confirmPaymentAndMarkComplete', { email });
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            console.error('Error confirming payment:', err);
          }
          // Clear the payment_success param and reload to get fresh data
          window.history.replaceState({}, document.title, createPageUrl('MediaPartnerDashboard'));
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

        const currentPath = location.pathname;
        const orientationRoutes = ['OrientationVideo', 'OrientationSizes', 'OrientationOnboardingFee'];
        const isOnOrientationRoute = orientationRoutes.some(route => currentPath.includes(route));

        // Not fully onboarded – block access unless on an orientation route
        if (!isOnOrientationRoute) {
          if (!orientationCompleted) {
            navigate(createPageUrl('OrientationVideo'), { replace: true });
          } else {
            // Orientation done but fee not paid – send to payment page
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