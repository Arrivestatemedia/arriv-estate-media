# Training Admin System — App Layout

The full layout shell: sticky dark header with role-based navigation, mobile hamburger menu, mobile bottom tabs, page transitions, and the Arriv brand theme variables (Cream #FFFBF5, Gold #B8956A, Black #1A1A1A).

---

## `src/Layout.jsx`

> Wraps every page. Reads the current user (sales session OR Base44 auth), renders role-based nav items in the header, handles mobile menu, logout, and mobile bottom tabs. Includes the brand theme variables as inline `<style>`.

```jsx
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Menu, X, LogOut, Briefcase, LayoutDashboard, Settings, ArrowLeft, Key, FileText, CalendarClock, Send, ShieldCheck, Shield, Wallet, Landmark, TrendingUp, Award, Film, Brain, CalendarOff, Heart, MapPin, Gift, Tag, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MobileBottomTabs from "@/components/layout/MobileBottomTabs";
import PageTransition from "@/components/layout/PageTransition";

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Helper: read from localStorage with sessionStorage fallback (Safari ITP)
    const getItem = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);

    // Check for sales team member first
    const salesMemberId = getItem('sales_member_id');
    const salesMemberName = getItem('sales_member_name');
    const salesMemberEmail = getItem('sales_member_email');

    if (salesMemberId && salesMemberName) {
      const salesMemberRole = getItem('sales_member_role') || 'user';
      setUser({
        id: salesMemberId,
        email: salesMemberEmail,
        full_name: salesMemberName,
        user_type: 'sales',
        role: salesMemberRole
      });
    } else {
      const userEmail = getItem('user_email');
      const userName = getItem('user_name');
      const userType = getItem('user_type');
      const userRole = getItem('user_role');
      
      if (userEmail && userName && userType) {
        setUser({
          email: userEmail,
          full_name: userName,
          user_type: userType,
          role: userRole || 'user'
        });
      }
    }

    // Always check Base44 auth — platform admin role takes precedence over
    // sales session role so admins see the full admin nav even with a sales session.
    base44.auth.isAuthenticated().then(isAuth => {
      if (isAuth) {
        base44.auth.me().then((userData) => {
          if (userData) {
            if (salesMemberId && salesMemberName) {
              // Merge: sales session for data access + platform role for admin nav
              setUser({
                id: salesMemberId,
                email: userData.email || salesMemberEmail,
                full_name: salesMemberName,
                user_type: 'sales',
                role: userData.role || salesMemberRole
              });
            } else {
              setUser(userData);
            }
            if (userData.role) {
              localStorage.setItem('user_role', userData.role);
            }
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [currentPageName]);

  const isAdmin = user?.role === "admin";
  const isClient = user?.user_type === "client";
  const isMediaPartner = user?.user_type === "media_partner";

  const salesMemberRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
  const hasSalesSession = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
  const isSalesTeam = hasSalesSession && salesMemberRole !== 'admin' && !isAdmin;
  const isSalesAdmin = hasSalesSession && salesMemberRole === 'admin';

  // ── Role-based navigation ──
  // Customize these arrays for your app's pages.
  const navItems = isSalesTeam
      ? [
          { label: "My Dashboard", page: "HubSpotActivityLog", icon: LayoutDashboard },
          { label: "My Performance", page: "SalesPerformanceDashboard", icon: TrendingUp },
          { label: "Training", page: "SalesTrainingPortal", icon: Award },
          { label: "Field Prospecting", page: "FieldProspectingPage", icon: MapPin },
          { label: "Referrals", page: "ReferralProgramPage", icon: Gift },
          { label: "Customer Success", page: "CustomerSuccessPage", icon: CheckCircle2 },
          { label: "My Recordings", page: "Recordings", icon: Film },
          { label: "My Profile", page: "EmployeeProfile", icon: Award },
          { label: "Time Off", page: "TimeOff", icon: CalendarOff },
          { label: "My Benefits", page: "Benefits", icon: Heart },
        ]
      : (isAdmin || isSalesAdmin)
        ? [
            { label: "Admin Hub", page: "AdminHub", icon: LayoutDashboard },
            { label: "My Performance", page: "SalesPerformanceDashboard", icon: TrendingUp },
            { label: "Training Admin", page: "SalesTrainingAdmin", icon: Shield },
            { label: "Discount Approvals", page: "DiscountApprovalPage", icon: Tag },
            { label: "Sales Team", page: "AdminSalesSignup", icon: FileText },
            { label: "Sales Rep Activity", page: "AdminSalesRepActivity", icon: FileText },
            { label: "Background Checks", page: "AdminBackgroundChecks", icon: ShieldCheck },
            { label: "Commissions", page: "AdminCommissions", icon: Wallet },
            { label: "Sales Orientation", page: "AdminSalesOrientation", icon: ShieldCheck },
            { label: "Payroll Dashboard", page: "AdminPayrollDashboard", icon: Landmark },
            { label: "Payroll Settings", page: "AdminPayrollSettings", icon: Settings },
            { label: "Owner Dashboard", page: "OwnerDashboard", icon: TrendingUp },
            { label: "Khetha IQ by Arriv", page: "KhethaIQ", icon: Brain },
            { label: "Email Templates", page: "EmailPreview", icon: Send },
            { label: "My Recordings", page: "Recordings", icon: Film },
            { label: "My Profile", page: "EmployeeProfile", icon: Award },
            { label: "Time Off", page: "TimeOff", icon: CalendarOff },
            { label: "My Benefits", page: "Benefits", icon: Heart },
        ]
        : isClient
    ? [
        { label: "Book a Shoot", page: "BookingPage", icon: Briefcase },
        { label: "My Bookings", page: "ClientBookings", icon: Briefcase },
      ]
    : isMediaPartner
    ? [
        { label: "Available Jobs", page: "JobBoard", icon: Briefcase, showBadge: true },
        { label: "My Dashboard", page: "MediaPartnerDashboard", icon: LayoutDashboard },
        { label: "Payout Records", page: "PayoutRecords", icon: Wallet },
        { label: "Supra Access", page: "SupraAccess", icon: Settings },
      ]
    : [];

  const dashboardPage = isAdmin ? "AdminHub" : isClient ? "BookingPage" : isMediaPartner ? "MediaPartnerDashboard" : "JobBoard";

  // Determine if current page is a primary route (shows bottom tabs)
  const primaryRoutes = ["JobBoard", "MediaPartnerDashboard", "Dashboard", "BookingPage", "ClientBookings", "PublicAccountSettings", "SupraAccess", "PayoutRecords"];
  const isPrimaryRoute = primaryRoutes.includes(currentPageName);
  const showBackButton = user && !isPrimaryRoute && !isSalesTeam && !["SignIn", "ClientSignup", "MediaPartnerSignup", "SalesLogin"].includes(currentPageName);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]" style={{ paddingBottom: user && isPrimaryRoute ? '4rem' : '0' }}>
      <style>{`
        :root {
          --color-cream: #FFFBF5;
          --color-gold: #B8956A;
          --color-black: #1A1A1A;
          
          /* Light mode */
          --bg-primary: #FFFBF5;
          --bg-secondary: #FFFFFF;
          --text-primary: #1A1A1A;
          --text-secondary: rgba(26, 26, 26, 0.6);
          --accent-color: #B8956A;
          --accent-hover: #A68559;
          --border-color: rgba(184, 149, 106, 0.2);
          --card-bg: #FFFFFF;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --bg-primary: #0A0A0A;
            --bg-secondary: #1A1A1A;
            --text-primary: #FFFBF5;
            --text-secondary: rgba(255, 251, 245, 0.6);
            --accent-color: #B8956A;
            --accent-hover: #C9A87B;
            --border-color: rgba(184, 149, 106, 0.3);
            --card-bg: #1A1A1A;
          }
        }

        body {
          overscroll-behavior: none;
          -webkit-overflow-scrolling: touch;
        }

        button, a, [role="button"] {
          -webkit-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        nav::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <header 
        className="sticky top-0 z-50 bg-[#1A1A1A] border-b border-[#B8956A]/20"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.history.back()}
                className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10 mr-2"
                style={{ userSelect: 'none' }}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            {/* Logo — replace with your own */}
            <Link to={createPageUrl(user ? dashboardPage : "JobBoard")} className="flex items-center gap-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                alt="Arriv" 
                className="h-8"
              />
            </Link>
            )}

            <nav className="hidden md:flex items-center gap-1 overflow-x-auto whitespace-nowrap flex-nowrap" style={{ scrollbarWidth: 'none' }}>
              {navItems.length > 0 && navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentPageName === item.page;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0 ${
                        active
                          ? "bg-[#B8956A] text-[#1A1A1A]"
                          : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                  })}

                  {user && !isSalesTeam && !["SignIn", "ClientSignup", "MediaPartnerSignup", "SalesLogin"].includes(currentPageName) && (
                  <Link
                    to={createPageUrl("PublicAccountSettings")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      currentPageName === "PublicAccountSettings"
                        ? "bg-[#B8956A] text-[#1A1A1A]"
                        : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    Account Settings
                  </Link>
                  )}

              </nav>

            <div className="flex items-center gap-3">
              {user && (
                <div className="hidden md:flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-[#FFFBF5]">{user.full_name}</p>
                    <p className="text-xs text-[#B8956A]">
                      {isSalesTeam ? "Sales Team" : isAdmin ? "Admin" : isClient ? "Client" : "Media Partner"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                    onClick={() => {
                      localStorage.clear();
                      sessionStorage.clear();
                      window.location.replace(hasSalesSession ? '/SalesLogin' : createPageUrl("SignIn"));
                    }}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </Button>
                </div>
              )}
              <button
                className="md:hidden p-2 text-[#FFFBF5]"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-[#B8956A]/20 bg-[#1A1A1A] px-4 py-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
            {navItems.length > 0 && navItems.map((item) => {
                const Icon = item.icon;
                const active = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? "bg-[#B8956A] text-[#1A1A1A]"
                        : "text-[#FFFBF5]/70 hover:bg-[#FFFBF5]/10"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            {user && !isSalesTeam && !["SignIn", "ClientSignup", "MediaPartnerSignup", "SalesLogin"].includes(currentPageName) && (
              <Link
                to={createPageUrl("PublicAccountSettings")}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  currentPageName === "PublicAccountSettings"
                    ? "bg-[#B8956A] text-[#1A1A1A]"
                    : "text-[#FFFBF5]/70 hover:bg-[#FFFBF5]/10"
                }`}
              >
                <Settings className="w-4 h-4" />
                Account Settings
              </Link>
            )}
              {user && (
                <>
                  <button
                  onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.replace(hasSalesSession ? '/SalesLogin' : createPageUrl("SignIn"));
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
              )}
          </div>
        )}
      </header>

      <main>
        <PageTransition>
          {children}
        </PageTransition>
      </main>

      {/* Mobile Bottom Tabs */}
      <MobileBottomTabs user={user} />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <LayoutContent currentPageName={currentPageName}>
      {children}
    </LayoutContent>
  );
}
```

> **Note:** The source app's Layout.jsx also wraps children in `MediaPartnerGate` and renders `NotificationPanel`/`AdminNotificationPanel`, `SupportProvider`/`SupportBubble`/`SupportPanel`, `CallStatusProvider`, `GoogleMapsLoader`, `TwilioSdkLoader`, and a `TrackLink` special-case. Those are app-specific providers — include only the ones your target app needs. The version above includes the core layout (header, nav, mobile menu, page transitions, bottom tabs) which is what gives the Training Admin system its look and feel.

---

## `src/components/layout/PageTransition.jsx`

> Smooth fade/slide transition between pages using framer-motion.

```jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ x: 10, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -10, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

---

## `src/components/layout/MobileBottomTabs.jsx`

> Fixed bottom navigation bar for mobile (hidden on desktop and for sales team). Shows different tabs per user role. Includes scroll-position memory per route.

```jsx
import React, { useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Briefcase, LayoutDashboard, Settings, Key, Wallet } from "lucide-react";

const SESSION_STORAGE_KEY = 'mobile_tab_scroll_positions';

export default function MobileBottomTabs({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const scrollPositions = useRef({});
  const isRestoringScroll = useRef(false);

  const isSalesTeam = !!localStorage.getItem('sales_member_id');
  const isAdmin = user?.role === "admin";
  const isClient = user?.user_type === "client";
  const isMediaPartner = user?.user_type === "media_partner";

  // Customize these arrays for your app's pages.
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
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{tab.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

---

## `src/utils/index.ts` (createPageUrl helper)

> The `createPageUrl` helper used by Layout and MobileBottomTabs. If your target app doesn't already have it, add this:

```typescript
export function createPageUrl(pageName: string): string {
  return `/${pageName}`;
}
```

---

## Wiring the Layout into App.jsx

Your `src/App.jsx` should wrap each page in the Layout. The standard Base44 pattern:

```jsx
const LayoutWrapper = ({ children, currentPageName }) => (
  <Layout currentPageName={currentPageName}>{children}</Layout>
);

// Inside <Routes>:
<Route
  path="/SalesTrainingAdmin"
  element={
    <LayoutWrapper currentPageName="SalesTrainingAdmin">
      <SalesTrainingAdmin />
    </LayoutWrapper>
  }
/>
<Route
  path="/SalesTrainingPortal"
  element={
    <LayoutWrapper currentPageName="SalesTrainingPortal">
      <SalesTrainingPortal />
    </LayoutWrapper>
  }
/>
```

---

## Theme Variables

The layout injects these CSS variables via an inline `<style>` tag, giving the whole app the Arriv brand look:

| Variable | Light | Dark |
|---|---|---|
| `--bg-primary` | `#FFFBF5` (cream) | `#0A0A0A` |
| `--bg-secondary` | `#FFFFFF` | `#1A1A1A` |
| `--text-primary` | `#1A1A1A` | `#FFFBF5` |
| `--text-secondary` | `rgba(26,26,26,0.6)` | `rgba(255,251,245,0.6)` |
| `--accent-color` | `#B8956A` (gold) | `#B8956A` |
| `--accent-hover` | `#A68559` | `#C9A87B` |
| `--border-color` | `rgba(184,149,106,0.2)` | `rgba(184,149,106,0.3)` |
| `--card-bg` | `#FFFFFF` | `#1A1A1A` |

The header is always dark (`bg-[#1A1A1A]`) with gold accents, regardless of light/dark mode. Active nav items use `bg-[#B8956A] text-[#1A1A1A]`.