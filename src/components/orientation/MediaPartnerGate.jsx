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

        // If returning from a Stripe purchase, record it (does not gate access)
        const urlParams = new URLSearchParams(window.location.search);
        const isPaymentSuccess = urlParams.get('payment_success') === 'true';
        const paymentIntentId = urlParams.get('payment_intent');
        if (isPaymentSuccess && paymentIntentId) {
          try {
            await base44.functions.invoke('confirmPaymentAndMarkComplete', { email, paymentIntentId });
          } catch (err) {
            console.error('Error confirming payment:', err);
          }
          window.history.replaceState({}, document.title, createPageUrl('MediaPartnerDashboard'));
        }

        const checkResponse = await base44.functions.invoke('checkOrientationStatus', { email }).catch(() => null);
        const orientationCompleted = checkResponse?.data?.orientationCompleted || false;

        // Orientation completed – let through
        if (orientationCompleted) {
          setIsFullyOnboarded(true);
          setIsReady(true);
          return;
        }

        const currentPath = location.pathname;
        const orientationRoutes = ['OrientationVideo', 'OrientationSizes'];
        const isOnOrientationRoute = orientationRoutes.some(route => currentPath.includes(route));

        // Not onboarded – block access unless on an orientation route
        if (!isOnOrientationRoute) {
          navigate(createPageUrl('OrientationVideo'), { replace: true });
          setIsReady(true);
          return;
        }

        // On an orientation route – allow the route
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