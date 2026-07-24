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
        const paymentIntentId = urlParams.get('payment_intent');
        let didRedirect = false;
        if (urlParams.get('payment_success') === 'true' && paymentIntentId) {
          try {
            await base44.functions.invoke('confirmPaymentAndMarkComplete', { email, paymentIntentId });
          } catch (err) {
            console.error('Error confirming payment:', err);
          }
          didRedirect = true;
        } else if (urlParams.get('apparel_success') === 'true' && paymentIntentId) {
          try {
            await base44.functions.invoke('confirmApparelPurchase', { email, paymentIntentId });
          } catch (err) {
            console.error('Error confirming apparel purchase:', err);
          }
          didRedirect = true;
        }
        if (didRedirect) {
          window.history.replaceState({}, document.title, createPageUrl('MediaPartnerDashboard'));
        }

        const checkResponse = await base44.functions.invoke('checkOrientationStatus', { email }).catch(() => null);
        const orientationCompleted = checkResponse?.data?.orientationCompleted || false;
        const termsSigned = checkResponse?.data?.termsSigned || false;

        // Orientation completed – let through
        if (orientationCompleted) {
          setIsFullyOnboarded(true);
          setIsReady(true);
          return;
        }

        const currentPath = location.pathname;
        const allowedRoutes = ['OrientationVideo', 'OrientationSizes', 'MediaPartnerTermsConditions'];

        // Terms must be signed before any other onboarding step
        if (!termsSigned) {
          if (!currentPath.includes('MediaPartnerTermsConditions')) {
            navigate(createPageUrl('MediaPartnerTermsConditions'), { replace: true });
          }
          setIsReady(true);
          return;
        }

        const isOnAllowedRoute = allowedRoutes.some(route => currentPath.includes(route));

        // Not onboarded – block access unless on an orientation route
        if (!isOnAllowedRoute) {
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