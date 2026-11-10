import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isConfirmedSessionFailure, redirectIfSessionExpired } from '@/lib/customerSession';
import { loadCustomerAccount } from '@/lib/customerAccount';
import ClientInvoices from '@/components/client/ClientInvoices';
import PreferredMembershipCard from '@/components/client/PreferredMembershipCard';
import B2BClientDashboard from '@/components/b2b/B2BClientDashboard';
import CreditsSection from '@/components/visibility/CreditsSection';
import PropertyVisibilitySection from '@/components/visibility/PropertyVisibilitySection';
import ProfessionalProfileSection from '@/components/visibility/ProfessionalProfileSection';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';

/**
 * Billing & Visibility — one dashboard for everything a customer pays for.
 *
 * Invoices, prepaid credit, Auto-Fund, Preferred Membership, property visibility and company billing
 * are all existing systems, reused here as sections. A professional agent/brokerage profile is
 * OPTIONAL and sits last: nothing on this page requires one.
 *
 * The account is resolved from the signed customer session (falling back to the identity the custom
 * login already stores), so this screen never asks a customer to create a profile or sign in again
 * just to reach their own billing.
 */
const SECTIONS = [
  { id: 'invoices', label: 'Invoices & payments' },
  { id: 'credits', label: 'Prepaid & Auto-Fund' },
  { id: 'membership', label: 'Preferred Membership' },
  { id: 'visibility', label: 'Property visibility' },
  { id: 'profile', label: 'Professional profile' },
];

export default function VisibilityDashboard() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState('');

  // Deep links from the portal (#visibility, #invoices, …) and from a chosen plan.
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.hash, location.search]);

  useEffect(() => {
    loadCustomerAccount().then((account) => setEmail(account.email)).catch((err) => {
      if (!isConfirmedSessionFailure(err)) setAccountError('Your account could not be loaded. Please retry; your session has not been cleared.');
      redirectIfSessionExpired(err);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (accountError) return <div className="p-8 text-center"><p>{accountError}</p><Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button></div>;
  if (!email) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-8 text-center">
          <h1 className="font-serif text-2xl text-[#1A1A1A]">Billing &amp; Visibility</h1>
          <p className="text-sm text-[#1A1A1A]/55 mt-2 mb-6">
            Sign in to see your invoices, credit, membership and property visibility.
          </p>
          <Link to="/SignIn?redirect=/VisibilityDashboard">
            <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
              <LogIn className="w-4 h-4 mr-2" /> Sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Your account</p>
        <h1 className="font-serif text-3xl md:text-4xl text-[#1A1A1A] mt-1">Billing &amp; Visibility</h1>
        <p className="text-sm text-[#1A1A1A]/55 mt-1">
          Everything you pay for in one place. Nothing here requires a professional profile.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 mb-8">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="px-3 py-1.5 rounded-full border border-[#B8956A]/35 text-xs font-semibold text-[#1A1A1A]/70 hover:bg-[#B8956A]/10"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        <section id="invoices" className="scroll-mt-24">
          <h2 className="font-serif text-2xl text-[#1A1A1A] mb-3">Invoices &amp; payments</h2>
          <ClientInvoices email={email} compact />
          <p className="text-sm text-[#1A1A1A]/50 mt-2">
            Paid receipts and open invoices from your shoots and services appear here as they are issued.
          </p>
        </section>

        <CreditsSection email={email} />

        <section id="membership" className="scroll-mt-24">
          <h2 className="font-serif text-2xl text-[#1A1A1A] mb-3">Preferred Membership</h2>
          <PreferredMembershipCard email={email} />
        </section>

        <PropertyVisibilitySection email={email} />

        <section id="company" className="scroll-mt-24">
          <B2BClientDashboard userEmail={email} />
        </section>

        <ProfessionalProfileSection />
      </div>
    </div>
  );
}