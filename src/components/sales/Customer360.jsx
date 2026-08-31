import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Phone, Mail, Building2, User, UserPlus, Tag, Clock, ArrowLeft,
  Plus, Briefcase, DollarSign, Home, Calendar, FileText, CheckCircle2,
  AlertCircle, RefreshCw, ShoppingBag, TrendingUp, MapPin
} from "lucide-react";
import { format } from "date-fns";
import LogActivityModal from "@/components/sales/LogActivityModal";
import ConvertToJobModal from "@/components/sales/ConvertToJobModal";
import DiscountRequestModal from "@/components/sales/DiscountRequestModal";

const PACKAGE_LABELS = {
  mls_walkthrough: "MLS Walkthrough",
  photo_essentials: "Photo Essentials",
  photo_cinematic: "Photo Cinematic",
  premium_bundle: "Premium Bundle",
};

const ADDON_LABELS = {
  drone: "Drone",
  "3d_tour": "3D Tour",
  twilight: "Twilight",
  rush_delivery: "Rush Delivery",
  vertical_reel: "Vertical Reel",
  ai_staging: "AI Staging",
};

const BOOKING_STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  approved: "bg-[#B8956A]/20 text-[#B8956A]",
  completed: "bg-[#B8956A] text-[#1A1A1A]",
  cancelled: "bg-red-100 text-red-700",
  denied: "bg-red-100 text-red-700",
};

const INVOICE_STATUS_COLORS = {
  paid: "bg-[#B8956A] text-[#1A1A1A]",
  unpaid: "bg-amber-100 text-amber-700",
};

export default function Customer360({ contact, contactKey, activities, onReload }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [bookings, setBookings] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [pendingSignup, setPendingSignup] = useState(null);
  const [loading360, setLoading360] = useState(true);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpData, setFollowUpData] = useState({ notes: "", activity_date: "", activity_type: "call" });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const customerEmail = (contact?.email || contactKey || "").toLowerCase().trim();

  useEffect(() => {
    loadCustomerData();
  }, [customerEmail]);

  const loadCustomerData = async () => {
    if (!customerEmail) return;
    setLoading360(true);
    try {
      const [bookingResults, jobResults, invoiceResults, signupResults] = await Promise.all([
        base44.entities.Booking.list('-created_date', 200).catch(() => []),
        base44.entities.Job.list('-created_date', 200).catch(() => []),
        base44.entities.Invoice.list('-created_date', 200).catch(() => []),
        base44.entities.PendingSignup.filter({ email: customerEmail }).catch(() => []),
      ]);

      setBookings(bookingResults.filter(b => (b.client_email || "").toLowerCase() === customerEmail));
      setJobs(jobResults.filter(j => (j.client_email || "").toLowerCase() === customerEmail));
      setInvoices(invoiceResults.filter(i => (i.client_email || "").toLowerCase() === customerEmail));
      setPendingSignup(signupResults && signupResults[0] ? signupResults[0] : null);
    } catch (e) {
      console.error("Customer360 load error:", e);
    } finally {
      setLoading360(false);
    }
  };

  // ── Derived stats ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const paidInvoices = invoices.filter(i => i.payment_status === "paid");
    const lifetimeRevenue = paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);
    const allOrders = [...bookings, ...jobs];
    const sortedByDate = [...allOrders].sort((a, b) => {
      const da = new Date(a.preferred_date || a.date || a.created_date || 0);
      const db = new Date(b.preferred_date || b.date || b.created_date || 0);
      return db - da;
    });
    const firstOrder = sortedByDate[sortedByDate.length - 1];
    const lastOrder = sortedByDate[0];
    const avgOrderValue = paidInvoices.length > 0 ? lifetimeRevenue / paidInvoices.length : 0;
    return {
      totalOrders: allOrders.length,
      paidOrders: paidInvoices.length,
      lifetimeRevenue,
      avgOrderValue,
      firstOrder,
      lastOrder,
      repeatCustomer: allOrders.length > 1,
    };
  }, [bookings, jobs, invoices]);

  const accountStatus = useMemo(() => {
    if (!pendingSignup) return { label: "No Front-End Account", color: "bg-slate-200 text-slate-600", icon: AlertCircle };
    if (pendingSignup.status === "completed") return { label: "Active", color: "bg-[#B8956A] text-[#1A1A1A]", icon: CheckCircle2 };
    return { label: "Activation Pending", color: "bg-amber-100 text-amber-700", icon: Clock };
  }, [pendingSignup]);

  const handleLogFollowUp = async () => {
    if (!followUpData.notes || !followUpData.activity_date) return;
    setSavingFollowUp(true);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
      await base44.entities.ActivityLog.create({
        activity_type: followUpData.activity_type,
        contact_name: contact?.name || contactKey,
        contact_email: contact?.email || '',
        company_name: contact?.company || '',
        activity_date: new Date(followUpData.activity_date).toISOString(),
        notes: followUpData.notes,
        sales_member_id: salesMemberId,
        sales_member_email: salesMemberEmail,
      });
      setShowFollowUpForm(false);
      setFollowUpData({ notes: "", activity_date: "", activity_type: "call" });
      if (onReload) onReload();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleResendActivation = async () => {
    if (!customerEmail || !contact?.name) return;
    if (!confirm(`Resend account activation email to ${customerEmail}?`)) return;
    try {
      const res = await base44.functions.invoke('resendCustomerOnboardingEmail', {
        email: customerEmail,
        full_name: contact.name,
      });
      if (res?.data?.success || res?.success) {
        alert("Activation email resent successfully.");
        loadCustomerData();
      } else {
        alert(res?.data?.error || res?.error || "Failed to resend activation email.");
      }
    } catch (e) {
      alert(e?.message || "Failed to resend activation email.");
    }
  };

  const activityIcons = {
    call: <Phone className="w-4 h-4" />,
    email: <Mail className="w-4 h-4" />,
    meeting: <Clock className="w-4 h-4" />,
    task: <Clock className="w-4 h-4" />,
    note: <Clock className="w-4 h-4" />,
  };

  const activityLabels = {
    call: "Call", email: "Email", meeting: "Meeting", task: "Task", note: "Note",
  };

  if (loading360) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center" style={{ backgroundColor: '#FFFBF5' }}>
        <div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="mb-4 gap-2" style={{ color: '#B8956A' }}>
          <ArrowLeft className="w-4 h-4" /> Back to My Contacts
        </Button>

        {/* ── Customer 360 Header ─────────────────────────────────── */}
        <Card className="mb-6" style={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(184,149,106,0.3)' }}>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <div className="p-3 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                <User className="w-8 h-8" style={{ color: '#B8956A' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold" style={{ color: '#FFFBF5' }}>{contact?.name || contactKey}</h1>
                  <Badge className="bg-[#B8956A] text-[#1A1A1A]">Customer</Badge>
                  <Badge className={accountStatus.color}>
                    <accountStatus.icon className="w-3 h-3 mr-1" />
                    {accountStatus.label}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-sm" style={{ color: 'rgba(255,251,245,0.7)' }}>
                  {contact?.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" />{contact.email}</span>}
                  {contact?.company && <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{contact.company}</span>}
                  {contact?.phone && (
                    <button
                      onClick={() => {
                        localStorage.setItem('_dialerPhone', contact.phone);
                        window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                      }}
                      className="flex items-center gap-1 hover:opacity-70 transition-opacity"
                      style={{ color: '#B8956A' }}
                    >
                      <Phone className="w-4 h-4" />{contact.phone}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex flex-wrap gap-2">
              {contact?.phone && (
                <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                  onClick={() => {
                    localStorage.setItem('_dialerPhone', contact.phone);
                    window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                  }}>
                  <Phone className="w-4 h-4" /> Call
                </Button>
              )}
              {contact?.email && (
                <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                  onClick={() => {
                    localStorage.setItem('_emailTo', contact.email);
                    window.dispatchEvent(new CustomEvent('openEmailComposer', { detail: { email: contact.email } }));
                  }}>
                  <Mail className="w-4 h-4" /> Email
                </Button>
              )}
              <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                onClick={() => setShowNewJobModal(true)}>
                <Briefcase className="w-4 h-4" /> New Job
              </Button>
              <Button size="sm" variant="outline" className="gap-2"
                style={{ borderColor: '#B8956A', color: '#B8956A', backgroundColor: 'transparent' }}
                onClick={() => setShowLogActivity(true)}>
                <Plus className="w-4 h-4" /> Add Note
              </Button>
              <Button size="sm" variant="outline" className="gap-2"
                style={{ borderColor: '#B8956A', color: '#B8956A', backgroundColor: 'transparent' }}
                onClick={() => setShowDiscountModal(true)}>
                <Tag className="w-4 h-4" /> Request Discount
              </Button>
              {pendingSignup?.status === "pending" && (
                <Button size="sm" variant="outline" className="gap-2"
                  style={{ borderColor: '#B8956A', color: '#B8956A', backgroundColor: 'transparent' }}
                  onClick={handleResendActivation}>
                  <RefreshCw className="w-4 h-4" /> Resend Activation
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-white border" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="orders">Jobs & Orders</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ────────────────────────────────────────── */}
          <TabsContent value="overview">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard icon={DollarSign} label="Lifetime Revenue" value={`$${stats.lifetimeRevenue.toLocaleString()}`} />
              <StatCard icon={ShoppingBag} label="Total Orders" value={stats.totalOrders} />
              <StatCard icon={CheckCircle2} label="Paid Orders" value={stats.paidOrders} />
              <StatCard icon={TrendingUp} label="Avg Order Value" value={`$${stats.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold mb-3" style={{ color: '#1A1A1A' }}>Customer Summary</h3>
                  <div className="space-y-2 text-sm">
                    <SummaryRow label="Customer Since" value={stats.firstOrder ? format(new Date(stats.firstOrder.preferred_date || stats.firstOrder.date || stats.firstOrder.created_date), "MMM d, yyyy") : "—"} />
                    <SummaryRow label="First Order" value={stats.firstOrder ? (PACKAGE_LABELS[stats.firstOrder.package] || stats.firstOrder.title || "—") : "—"} />
                    <SummaryRow label="Last Order" value={stats.lastOrder ? format(new Date(stats.lastOrder.preferred_date || stats.lastOrder.date || stats.lastOrder.created_date), "MMM d, yyyy") : "—"} />
                    <SummaryRow label="Repeat Customer" value={stats.repeatCustomer ? "Yes" : "No"} />
                    <SummaryRow label="Front-End Account" value={accountStatus.label} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold mb-3" style={{ color: '#1A1A1A' }}>Recent Activity</h3>
                  {activities.length === 0 ? (
                    <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>No activity recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {activities.slice(0, 5).map(a => (
                        <div key={a.id} className="flex items-start gap-2 text-sm">
                          <div className="mt-0.5 p-1.5 rounded shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                            {activityIcons[a.activity_type]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate" style={{ color: '#1A1A1A' }}>{(a.notes || '').slice(0, 80)}{(a.notes || '').length > 80 ? '...' : ''}</p>
                            <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{format(new Date(a.activity_date), "MMM d, yyyy")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Activity Tab ───────────────────────────────────────── */}
          <TabsContent value="activity">
            {/* Follow-up form */}
            <div className="mb-4">
              {showFollowUpForm ? (
                <div className="space-y-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.3)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Schedule Follow-up</p>
                  <select className="w-full h-9 px-3 rounded-md text-sm border" style={{ borderColor: 'rgba(184,149,106,0.3)' }}
                    value={followUpData.activity_type} onChange={e => setFollowUpData(p => ({ ...p, activity_type: e.target.value }))}>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                  </select>
                  <input type="datetime-local" className="w-full h-9 px-3 rounded-md text-sm border" style={{ borderColor: 'rgba(184,149,106,0.3)' }}
                    value={followUpData.activity_date} onChange={e => setFollowUpData(p => ({ ...p, activity_date: e.target.value }))} />
                  <textarea className="w-full px-3 py-2 rounded-md text-sm border" rows={2} style={{ borderColor: 'rgba(184,149,106,0.3)' }}
                    placeholder="What's the plan for this follow-up?"
                    value={followUpData.notes} onChange={e => setFollowUpData(p => ({ ...p, notes: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleLogFollowUp} disabled={savingFollowUp || !followUpData.notes || !followUpData.activity_date}
                      style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                      {savingFollowUp ? 'Saving...' : 'Save Follow-up'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowFollowUpForm(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="gap-2"
                  style={{ borderColor: '#B8956A', color: '#B8956A' }}
                  onClick={() => { setShowFollowUpForm(true); setFollowUpData({ notes: "", activity_date: "", activity_type: "call" }); }}>
                  <Plus className="w-4 h-4" /> Schedule Follow-up
                </Button>
              )}
            </div>

            {/* Activity timeline */}
            <div className="space-y-3">
              {activities.length === 0 ? (
                <Card><CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
                  <p>No activities yet</p>
                </CardContent></Card>
              ) : (
                activities.map(activity => (
                  <Card key={activity.id} className="hover:shadow-md transition">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-2 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                          {activityIcons[activity.activity_type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline">{activityLabels[activity.activity_type]}</Badge>
                          <p className="mt-2 text-sm" style={{ color: '#1A1A1A' }}>
                            {(activity.notes || '').replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '').replace(/\n\n--- CALL MAP ---[\s\S]*/i, '').replace(/^\[AI Scheduled\]\s*/, '').trim()}
                          </p>
                          {activity.duration_minutes > 0 && (
                            <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{activity.duration_minutes} minutes</p>
                          )}
                          <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
                            {format(new Date(activity.activity_date), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Jobs & Orders Tab ──────────────────────────────────── */}
          <TabsContent value="orders">
            <OrdersTab bookings={bookings} jobs={jobs} />
          </TabsContent>

          {/* ── Invoices Tab ───────────────────────────────────────── */}
          <TabsContent value="invoices">
            <InvoicesTab invoices={invoices} />
          </TabsContent>

          {/* ── Account Tab ────────────────────────────────────────── */}
          <TabsContent value="account">
            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold mb-4" style={{ color: '#1A1A1A' }}>Front-End Account Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: accountStatus.color.includes('amber') ? 'rgba(251,191,36,0.1)' : accountStatus.color.includes('B8956A') ? 'rgba(184,149,106,0.1)' : 'rgba(0,0,0,0.05)' }}>
                    <accountStatus.icon className="w-5 h-5" />
                    <div>
                      <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{accountStatus.label}</p>
                      <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        {pendingSignup?.status === "completed" ? "Customer has activated their front-end account." : pendingSignup?.status === "pending" ? "Account provisioning initiated. Customer must check their email and complete signup." : "No front-end account found for this customer."}
                      </p>
                    </div>
                  </div>

                  {pendingSignup && (
                    <div className="space-y-2 text-sm">
                      <SummaryRow label="Account Email" value={pendingSignup.email} />
                      <SummaryRow label="Account Name" value={pendingSignup.full_name} />
                      <SummaryRow label="Account Type" value={pendingSignup.user_type || "client"} />
                      <SummaryRow label="Provisioning Status" value={pendingSignup.status || "—"} />
                    </div>
                  )}

                  {pendingSignup?.status === "pending" && (
                    <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                      onClick={handleResendActivation}>
                      <RefreshCw className="w-4 h-4" /> Resend Activation Email
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Modals ──────────────────────────────────────────────── */}
        <LogActivityModal
          open={showLogActivity}
          onClose={() => setShowLogActivity(false)}
          contact={contact}
          salesMemberId={localStorage.getItem('sales_member_id')}
          salesMemberEmail={localStorage.getItem('sales_member_email')}
          onLogged={() => { setShowLogActivity(false); if (onReload) onReload(); }}
        />
        <ConvertToJobModal
          open={showNewJobModal}
          onClose={() => setShowNewJobModal(false)}
          contact={contact}
          onSent={() => setShowNewJobModal(false)}
        />
        {showDiscountModal && (
          <DiscountRequestModal
            contact={contact}
            onClose={() => setShowDiscountModal(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4" style={{ color: '#B8956A' }} />
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>{label}</p>
        </div>
        <p className="text-xl font-bold" style={{ color: '#1A1A1A' }}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: 'rgba(26,26,26,0.6)' }}>{label}</span>
      <span className="font-medium" style={{ color: '#1A1A1A' }}>{value}</span>
    </div>
  );
}

function OrdersTab({ bookings, jobs }) {
  if (bookings.length === 0 && jobs.length === 0) {
    return (
      <Card><CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
        <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No jobs or orders yet</p>
      </CardContent></Card>
    );
  }
  return (
    <div className="space-y-4">
      {bookings.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Bookings</h3>
          <div className="space-y-2">
            {bookings.map(b => (
              <Card key={b.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={BOOKING_STATUS_COLORS[b.status] || "bg-slate-100"}>{b.status || "pending"}</Badge>
                        <span className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{PACKAGE_LABELS[b.package] || b.package || "—"}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        <p className="flex items-center gap-1"><Home className="w-3.5 h-3.5" />{b.street_address}, {b.city}, {b.state}</p>
                        <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{b.preferred_date ? format(new Date(b.preferred_date), "MMM d, yyyy") : "—"}</p>
                        {b.add_ons && b.add_ons.length > 0 && (
                          <p className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{b.add_ons.map(a => ADDON_LABELS[a] || a).join(", ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold" style={{ color: '#1A1A1A' }}>{b.custom_price_text || (b.total_price ? `$${b.total_price.toLocaleString()}` : "")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      {jobs.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Jobs</h3>
          <div className="space-y-2">
            {jobs.map(j => (
              <Card key={j.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-slate-100 text-slate-700">{j.status || "open"}</Badge>
                        <span className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{j.title}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
                        <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{j.location}</p>
                        <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{j.date ? format(new Date(j.date), "MMM d, yyyy") : "—"}</p>
                        {j.package && <p className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{PACKAGE_LABELS[j.package] || j.package}</p>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesTab({ invoices }) {
  if (invoices.length === 0) {
    return (
      <Card><CardContent className="pt-8 pb-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
        <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No invoices yet</p>
      </CardContent></Card>
    );
  }
  const totalPaid = invoices.filter(i => i.payment_status === "paid").reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalOutstanding = invoices.filter(i => i.payment_status !== "paid").reduce((sum, i) => sum + (i.amount || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Total Paid</p>
          <p className="text-lg font-bold" style={{ color: '#B8956A' }}>${totalPaid.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Outstanding</p>
          <p className="text-lg font-bold" style={{ color: '#1A1A1A' }}>${totalOutstanding.toLocaleString()}</p>
        </CardContent></Card>
      </div>
      {invoices.map(inv => (
        <Card key={inv.id}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={INVOICE_STATUS_COLORS[inv.payment_status] || "bg-slate-100"}>{inv.payment_status || "unpaid"}</Badge>
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>{inv.invoice_type?.replace(/_/g, " ")}</span>
                </div>
                <div className="mt-2 space-y-1 text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
                  <p className="flex items-center gap-1"><Home className="w-3.5 h-3.5" />{inv.job_address || "—"}</p>
                  <p className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{inv.service_date ? format(new Date(inv.service_date), "MMM d, yyyy") : "—"}</p>
                  {inv.invoice_number && <p className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />#{inv.invoice_number}</p>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-lg" style={{ color: '#1A1A1A' }}>${(inv.amount || 0).toLocaleString()}</p>
                {inv.paid_at && <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>Paid {format(new Date(inv.paid_at), "MMM d")}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}