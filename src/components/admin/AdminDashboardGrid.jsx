import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, ShieldCheck, Wallet, Landmark, Settings, BarChart3, UserCog } from "lucide-react";

const ADMIN_SECTIONS = [
  { label: "Sales Team", page: "AdminSalesSignup", icon: Users, description: "Manage sales reps and onboarding" },
  { label: "Sales Rep Activity", page: "AdminSalesRepActivity", icon: BarChart3, description: "Rep call maps and prospecting" },
  { label: "Applications", page: "AdminApplications", icon: FileText, description: "Review sales job applications" },
  { label: "Background Checks", page: "AdminBackgroundChecks", icon: ShieldCheck, description: "Checkr status and results" },
  { label: "Commissions", page: "AdminCommissions", icon: Wallet, description: "Commission plans and adjustments" },
  { label: "Sales Orientation", page: "AdminSalesOrientation", icon: UserCog, description: "Orientation and onboarding" },
  { label: "Payroll Dashboard", page: "AdminPayrollDashboard", icon: Landmark, description: "Payroll periods and submissions" },
  { label: "Payroll Settings", page: "AdminPayrollSettings", icon: Settings, description: "Arriv Payroll integration" },
  { label: "Users", page: "AdminUsers", icon: Users, description: "Admin user accounts" },
];

export default function AdminDashboardGrid() {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {ADMIN_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.page} to={createPageUrl(section.page)} className="hover:no-underline">
              <Card className="hover:shadow-lg transition-shadow h-full cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Icon className="w-5 h-5" style={{ color: '#B8956A' }} />
                    {section.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{section.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}