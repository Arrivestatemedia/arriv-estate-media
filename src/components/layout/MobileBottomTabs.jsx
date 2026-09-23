import React, { useEffect, useRef, useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { base44 } from "@/api/base44Client";
import { Briefcase, LayoutDashboard, Settings, Key, Wallet, Film } from "lucide-react";
import NewJobsBadge from "./NewJobsBadge";

const SESSION_STORAGE_KEY = 'mobile_tab_scroll_positions';

export default function MobileBottomTabs({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const scrollPositions = useRef({});
  const isRestoringScroll = useRef(false);
  const [studioActive, setStudioActive] = useState(() => {
    try {
      const cached = localStorage.getItem("studio_entitlement");
      return cached ? JSON.parse(cached)?.active === true : false;
    } catch {
      return false;
    }
  });

  // Refresh Studio entitlement on mount and when user changes
  useEffect(() => {
    if (!user || user.user_type !== "client") return;
    base44.functions.invoke("getStudioEntitlement", {})
      .then((res) => {
        const data = res?.data || res;
        const active = !!data?.active;
        setStudioActive(active);
        localStorage.setItem("studio_entitlement", JSON.stringify({ active }));
      })
      .catch(() => {});
  }, [user?.user_type, user?.email]);

  const isSalesTeam = !!localStorage.getItem('sales_member_id');
  const isAdmin = user?.role === "admin";
  const isClient = user?.user_type === "client";
  const isMediaPartner = user?.user_type === "media_partner";

  const clientTabs = [
    { label: "Book", page: "BookingPage", icon: Briefcase },
    { label: "Bookings", page: "ClientBookings", icon: Briefcase },
  ];
  // CONDITIONAL: Studio tab only appears when entitlement is active
  if (studioActive) {
    clientTabs.push({ label: "Studio", page: "StudioWorkspace", icon: Film });
  }
  clientTabs.push({ label: "Settings", page: "PublicAccountSettings", icon: Settings });

  const tabs = isAdmin
    ? [
        { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
        { label: "Jobs", page: "JobBoard", icon: Briefcase },
        { label: "Settings", page: "PublicAccountSettings", icon: Settings },
      ]
    : isClient
    ? clientTabs
    : isMediaPartner
    ? [
        { label: "Jobs", page: "JobBoard", icon: Briefcase, showBadge: true },
        { label: "Dashboard", page: "MediaPartnerDashboard", icon: LayoutDashboard },
        { label: "Payouts", page: "PayoutRecords", icon: Wallet },
        { label: "Supra", page: "SupraAccess", icon: Key },
        { label: "Settings", page: "PublicAccountSettings", icon: Settings },
      ]
    : [];

  // Load scroll positions from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        scrollPositions.current = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load scroll positions:', e);
    }
  }, []);

  // Save scroll position when scrolling
  useEffect(() => {
    let debounceTimer;
    const saveScrollPosition = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scrollPositions.current[currentPath] = window.scrollY;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(scrollPositions.current));
        } catch (e) {
          console.error('Failed to save scroll position:', e);
        }
      }, 100);
    };
    
    window.addEventListener('scroll', saveScrollPosition, { passive: true });
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('scroll', saveScrollPosition);
    };
  }, [currentPath]);

  // Restore scroll position when navigating
  useEffect(() => {
    const savedPosition = scrollPositions.current[currentPath];
    if (savedPosition !== undefined && !isRestoringScroll.current) {
      isRestoringScroll.current = true;
      
      // Use requestAnimationFrame for smoother restoration
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
        setTimeout(() => {
          isRestoringScroll.current = false;
        }, 100);
      });
    } else {
      isRestoringScroll.current = false;
    }
  }, [currentPath]);

  const handleTabClick = (e, page) => {
    const targetPath = `/${page}`;
    if (currentPath === targetPath) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!user || tabs.length === 0 || isSalesTeam) return null;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-[var(--bg-primary)] border-t border-[var(--border-color)] z-40"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <nav className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentPath === `/${tab.page}`;
          
          return (
            <Link
              key={tab.page}
              to={createPageUrl(tab.page)}
              onClick={(e) => handleTabClick(e, tab.page)}
              className="flex flex-col items-center justify-center flex-1 h-full relative"
              style={{ userSelect: 'none' }}
            >
              <div className={`flex flex-col items-center gap-1 ${isActive ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)]'}`}>
                <div className="relative">
                  <Icon className="w-6 h-6" />
                  {tab.showBadge && <NewJobsBadge />}
                </div>
                <span className="text-xs font-medium">{tab.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}