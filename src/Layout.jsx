import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Menu, X, LogOut, Briefcase, LayoutDashboard, Settings, ArrowLeft, Key, FileText, CalendarClock, Send, ShieldCheck, Wallet, Landmark, TrendingUp, Award, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoogleMapsLoader from "@/components/GoogleMapsLoader";
import TwilioSdkLoader from "@/components/TwilioSdkLoader";
import NewJobsBadge from "@/components/layout/NewJobsBadge";
import MobileBottomTabs from "@/components/layout/MobileBottomTabs";
import PageTransition from "@/components/layout/PageTransition";
import MediaPartnerGate from "@/components/orientation/MediaPartnerGate";
import TrackLink from "@/pages/TrackLink";
import { CallStatusProvider, useCallStatus } from "@/components/CallStatusContext";
import NotificationPanel from "@/components/sales/NotificationPanel";
import AdminNotificationPanel from "@/components/sales/AdminNotificationPanel";

function LayoutContent({ children, currentPageName }) {
  const { isCallInitiator, callStatus, isInLiveCall } = useCallStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Force password change gate for newly-onboarded sales reps
  useEffect(() => {
    const salesId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const forcePw = localStorage.getItem('sales_force_password_change') || sessionStorage.getItem('sales_force_password_change');
    if (salesId && forcePw === 'true' && currentPageName !== "SalesChangePassword" && currentPageName !== "SalesLogin") {
      const tabHint = new URLSearchParams(window.location.search).get('tab');
      const target = createPageUrl("SalesChangePassword") + (tabHint ? `?tab=${encodeURIComponent(tabHint)}` : '');
      navigate(target, { replace: true });
    }
  }, [currentPageName, navigate]);

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
      return;
    }

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

  const salesMemberRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
  const hasSalesSession = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
  const isSalesTeam = hasSalesSession && salesMemberRole !== 'admin';
  const isSalesAdmin = hasSalesSession && salesMemberRole === 'admin';

  const navItems = isSalesTeam
      ? [
          { label: "My Dashboard", page: "HubSpotActivityLog", icon: LayoutDashboard },
          { label: "My Performance", page: "SalesPerformanceDashboard", icon: TrendingUp },
          { label: "My Recordings", page: "Recordings", icon: Film },
          { label: "My Profile", page: "EmployeeProfile", icon: Award },
        ]
      : isSalesAdmin
        ? [
            { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
            { label: "Admin Hub", page: "AdminHub", icon: LayoutDashboard },
            { label: "Owner Dashboard", page: "OwnerDashboard", icon: TrendingUp },
            { label: "My Performance", page: "SalesPerformanceDashboard", icon: TrendingUp },
            { label: "My Recordings", page: "Recordings", icon: Film },
            { label: "My Profile", page: "EmployeeProfile", icon: Award },
          ]
      : isAdmin
        ? [
            { label: "Admin Hub", page: "AdminHub", icon: LayoutDashboard },
            { label: "My Performance", page: "SalesPerformanceDashboard", icon: TrendingUp },
            { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
            { label: "Job Board", page: "JobBoard", icon: Briefcase },
            { label: "Bookings", page: "AdminBookings", icon: Briefcase },
            { label: "Users", page: "AdminUsers", icon: LayoutDashboard },
            { label: "Sales Team", page: "AdminSalesSignup", icon: FileText },
            { label: "Sales Rep Activity", page: "AdminSalesRepActivity", icon: FileText },
            { label: "Signed Terms", page: "AdminSignedTerms", icon: Settings },
            { label: "Client Terms", page: "AdminClientTerms", icon: Settings },
            { label: "Closing Invoice", page: "ManualClosingInvoice", icon: FileText },
            { label: "Notify Backup", page: "NotifyBackup", icon: Settings },
            { label: "Scheduled Bookings", page: "AdminScheduledBookings", icon: CalendarClock },
            { label: "Send Media", page: "SendMediaToClient", icon: Send },
            { label: "Applications", page: "AdminApplications", icon: FileText },
            { label: "Background Checks", page: "AdminBackgroundChecks", icon: ShieldCheck },
        { label: "Commissions", page: "AdminCommissions", icon: Wallet },
        { label: "Sales Orientation", page: "AdminSalesOrientation", icon: ShieldCheck },
        { label: "Payroll Dashboard", page: "AdminPayrollDashboard", icon: Landmark },
        { label: "Payroll Settings", page: "AdminPayrollSettings", icon: Settings },
        { label: "Owner Dashboard", page: "OwnerDashboard", icon: TrendingUp },
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
        { label: "Supra Access", page: "SupraAccess", icon: Settings },
      ]
    : [];

  const dashboardPage = isAdmin ? "Dashboard" : isClient ? "BookingPage" : isMediaPartner ? "MediaPartnerDashboard" : "JobBoard";

  // Determine if current page is a primary route (shows bottom tabs)
  const primaryRoutes = ["JobBoard", "MediaPartnerDashboard", "Dashboard", "BookingPage", "ClientBookings", "PublicAccountSettings", "SupraAccess"];
  const isPrimaryRoute = primaryRoutes.includes(currentPageName);
  const showBackButton = user && !isPrimaryRoute && !isSalesTeam && !["SignIn", "ClientSignup", "MediaPartnerSignup", "SalesLogin"].includes(currentPageName);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]" style={{ paddingBottom: user && isPrimaryRoute ? '4rem' : '0' }}>
      {currentPageName !== "SignIn" && currentPageName !== "ClientSignup" && currentPageName !== "MediaPartnerSignup" && currentPageName !== "SalesLogin" && <GoogleMapsLoader />}
      <TwilioSdkLoader />
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
            {(currentPageName === "ClientSignup" || currentPageName === "MediaPartnerSignup" || currentPageName === "SignIn" || currentPageName === "SalesLogin") ? (
                  <div className="flex items-center gap-3">
                    <img 
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                      alt="Arriv" 
                      className="h-8"
                    />
                  </div>
                ) : isSalesTeam ? (
                  <div className="flex items-center gap-3">
                    <img 
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                      alt="Arriv" 
                      className="h-8"
                    />
                  </div>
                ) : isClient || (!isAdmin && !isMediaPartner && !isSalesTeam) || ["BookingPage", "ClientBookings"].includes(currentPageName) ? (
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
        {isSalesTeam && isAdmin && <AdminNotificationPanel 
          userEmail={user?.email}
          queueUrl={createPageUrl('AdminActivityPage')}
        />}
        {isSalesTeam && !isAdmin && <NotificationPanel 
          userEmail={user?.email} 
          isAdmin={false}
          queueUrl={createPageUrl('HubSpotActivityLog') + '?tab=queue'}
        />}
        {currentPageName === "TrackLink" ? (
          <TrackLink />
        ) : (
          <MediaPartnerGate>
            <PageTransition>
              {children}
            </PageTransition>
          </MediaPartnerGate>
        )}
      </main>
      


      {/* Mobile Bottom Tabs */}
      <MobileBottomTabs user={user} />



      {/* Video Call Overlay — blocks right bottom area (initiator only) */}
      {isCallInitiator && (
        <div className="fixed bottom-0 right-0 w-1/2 h-1/2 bg-transparent pointer-events-auto z-[9998]" />
      )}
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <CallStatusProvider>
      <LayoutContent currentPageName={currentPageName}>
        {children}
      </LayoutContent>
    </CallStatusProvider>
  );
}