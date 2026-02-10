import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Menu, X, LogOut, Briefcase, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === "admin";
  const isCustomer = user?.user_type === "customer";
  const isContractor = user?.user_type === "contractor";

  const navItems = isAdmin
    ? [
        { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
        { label: "Job Board", page: "JobBoard", icon: Briefcase },
        { label: "Book a Shoot", page: "BookingPage", icon: Briefcase },
      ]
    : isCustomer
    ? [
        { label: "Book a Shoot", page: "BookingPage", icon: Briefcase },
      ]
    : isContractor
    ? [
        { label: "Available Jobs", page: "JobBoard", icon: Briefcase },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <style>{`
        :root {
          --color-cream: #FFFBF5;
          --color-gold: #B8956A;
          --color-black: #1A1A1A;
        }
      `}</style>

      <header className="sticky top-0 z-50 bg-[#1A1A1A] border-b border-[#B8956A]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to={createPageUrl(isAdmin ? "Dashboard" : isCustomer ? "BookingPage" : "JobBoard")} className="flex items-center gap-3">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" 
                alt="Arriv" 
                className="h-8"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
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
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              {user && (
                <div className="hidden md:flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-[#FFFBF5]">{user.full_name}</p>
                    <p className="text-xs text-[#B8956A]">{isAdmin ? "Admin" : "Contractor"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
                    onClick={() => base44.auth.logout()}
                  >
                    <LogOut className="w-4 h-4" />
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
            {navItems.map((item) => {
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
            {user && (
              <button
                onClick={() => base44.auth.logout()}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 w-full"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            )}
          </div>
        )}
      </header>

      <main>{children}</main>
    </div>
  );
}