import React from "react";
import { base44 } from "@/api/base44Client";
import ContactReassignment from "@/components/admin/ContactReassignment";

export default function AdminContactReassignment() {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');

    if (salesMemberId) {
      base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
        if (members?.[0]?.role === 'admin') {
          setUser({ id: salesMemberId, email: salesMemberEmail, full_name: salesMemberName, role: 'admin' });
        } else {
          window.location.href = '/HubSpotActivityLog';
        }
      }).catch(() => { window.location.href = '/SalesLogin'; });
    } else {
      base44.auth.isAuthenticated().then(isAuth => {
        if (isAuth) {
          base44.auth.me().then(me => {
            if (me?.role === 'admin') setUser(me);
            else window.location.href = '/';
          });
        } else {
          window.location.href = '/SalesLogin';
        }
      });
    }
  }, []);

  if (!user) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-5xl mx-auto">
        <ContactReassignment />
      </div>
    </div>
  );
}