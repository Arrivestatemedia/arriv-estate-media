import React, { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Briefcase, LayoutDashboard, Settings } from "lucide-react";
import NewJobsBadge from "./NewJobsBadge";

export default function MobileBottomTabs({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const scrollPositions = useRef({});

  const isAdmin = user?.role === "admin";
  const isClient = user?.user_type === "client";
  const isMediaPartner = user?.user_type === "media_partner";

  const tabs = isAdmin
    ? [
        { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
        { label: "Jobs", page: "JobBoard", icon: Briefcase },
        { label: "Settings", page: "PublicAccountSettings", icon: Settings },
      ]
    : isClient
    ? [
        { label: "Book", page: "BookingPage", icon: Briefcase },
        { label: "Bookings", page: "ClientBookings", icon: Briefcase },
        { label: "Settings", page: "PublicAccountSettings", icon: Settings },
      ]
    : isMediaPartner
    ? [
        { label: "Jobs", page: "JobBoard", icon: Briefcase, showBadge: true },
        { label: "Dashboard", page: "MediaPartnerDashboard", icon: LayoutDashboard },
        { label: "Settings", page: "PublicAccountSettings", icon: Settings },
      ]
    : [];

  useEffect(() => {
    const saveScrollPosition = () => {
      scrollPositions.current[currentPath] = window.scrollY;
    };
    
    window.addEventListener('scroll', saveScrollPosition);
    return () => window.removeEventListener('scroll', saveScrollPosition);
  }, [currentPath]);

  useEffect(() => {
    const savedPosition = scrollPositions.current[currentPath];
    if (savedPosition !== undefined) {
      window.scrollTo(0, savedPosition);
    }
  }, [currentPath]);

  const handleTabClick = (e, page) => {
    const targetPath = `/${page}`;
    if (currentPath === targetPath) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!user || tabs.length === 0) return null;

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