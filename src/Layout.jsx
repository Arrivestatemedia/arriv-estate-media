import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Menu, X, LogOut, Briefcase, LayoutDashboard, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoogleMapsLoader from "@/components/GoogleMapsLoader";
import NewJobsBadge from "@/components/layout/NewJobsBadge";
import MobileBottomTabs from "@/components/layout/MobileBottomTabs";
import PageTransition from "@/components/layout/PageTransition";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const userEmail = localStorage.getItem('user_email');
    const userName = localStorage.getItem('user_name');
    const userType = localStorage.getItem('user_type');
    const userRole = localStorage.getItem('user_role');
    
    if (userEmail && userName && userType) {
      setUser({
        email: userEmail,
        full_name: userName,
        user_type: userType,
        role: userRole || 'user'
      });
    }

    // Only try to get user if they're authenticated
    base44.auth.isAuthenticated().then(isAuth => {
      if (isAuth) {
        base44.auth.me().then((userData) => {
          if (userData) {
            setUser(userData);
            // Save the role to localStorage for future loads
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

  const navItems = isAdmin
        ? [
            { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
            { label: "Job Board", page: "JobBoard", icon: Briefcase },
            { label: "Bookings", page: "AdminBookings", icon: Briefcase },
            { label: "Users", page: "AdminUsers", icon: LayoutDashboard },
            { label: "Signed Terms", page: "AdminSignedTerms", icon: Settings },
            { label: "Notify Backup", page: "NotifyBackup", icon: Settings },
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
      ]
    : [];

  const dashboardPage = isAdmin ? "Dashboard" : isClient ? "BookingPage" : isMediaPartner ? "MediaPartnerDashboard" : "JobBoard";

  // Determine if current page is a primary route (shows bottom tabs)
  const primaryRoutes = ["JobBoard", "MediaPartnerDashboard", "Dashboard", "BookingPage", "ClientBookings", "PublicAccountSettings"];
  const isPrimaryRoute = primaryRoutes.includes(currentPageName);
  const showBackButton = user && !isPrimaryRoute && !["SignIn", "ClientSignup", "MediaPartnerSignup"].includes(currentPageName);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]" style={{ paddingBottom: user && isPrimaryRoute ? '4rem' : '0' }}>
      <GoogleMapsLoader />
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
            {(currentPageName === "ClientSignup" || currentPageName === "MediaPartnerSignup" || currentPageName === "SignIn") ? (
                  <div className="flex items-center gap-3">
                    <img 
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                      alt="Arriv" 
                      className="h-8"
                    />
                  </div>
                ) : (
                  <Link to={createPageUrl(user ? dashboardPage : "JobBoard")} className="flex items-center gap-3">
                    <img 
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                      alt="Arriv" 
                      className="h-8"
                    />
                  </Link>
                )}

            <nav className="hidden md:flex items-center gap-1">
              {navItems.length > 0 && navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentPageName === item.page;
                  return (
                    <Link
                      key={item.page}
                      to={createPageUrl(item.page)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        active
                          ? "bg-[#B8956A] text-[#1A1A1A]"
                          : "text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                      {item.showBadge && <NewJobsBadge />}
                    </Link>
                  );
                })}

                {user && !["SignIn", "ClientSignup", "MediaPartnerSignup"].includes(currentPageName) && (
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
                      {isAdmin ? "Admin" : isClient ? "Client" : "Media Partner"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                    onClick={() => {
                      localStorage.clear();
                      base44.auth.logout(createPageUrl("SignIn"));
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
          <div className="md:hidden border-t border-[#B8956A]/20 bg-[#1A1A1A] px-4 py-3 space-y-1">
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
                    {item.showBadge && <NewJobsBadge />}
                  </Link>
                );
              })}
            {user && !["SignIn", "ClientSignup", "MediaPartnerSignup"].includes(currentPageName) && (
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
                    base44.auth.logout(createPageUrl("SignIn"));
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