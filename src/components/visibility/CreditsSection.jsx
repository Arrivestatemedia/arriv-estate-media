import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { withCustomerSession } from '@/lib/customerSession';
import WalletPanel from '@/components/customer/WalletPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

/**
 * Prepaid credit and Auto-Fund status for the signed-in customer. The balances come from the same
 * wallet panel the portal uses, and enrollment stays on the existing Auto-Fund screens.
 */
export default function CreditsSection({ email }) {
  const [fund, setFund] = useState({ loading: true, subscription: null });

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke('manageAutoFund', withCustomerSession({ action: 'get_subscription' }))
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || res;
        setFund({ loading: false, subscription: data?.subscription || null });
      })
      .catch(() => {
        if (!cancelled) setFund({ loading: false, subscription: null });
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const status = fund.subscription?.status || '';

  return (
    <section id="credits" className="scroll-mt-24">
      <h2 className="font-serif text-2xl text-[#1A1A1A]">Prepaid &amp; Auto-Fund</h2>
      <p className="text-sm text-[#1A1A1A]/55 mt-1">
        Money already on your account, and the optional plan that keeps it topped up.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <WalletPanel customerEmail={email} />

        <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#B8956A]" />
              <p className="font-semibold text-[#1A1A1A]">Arriv Auto-Fund</p>
            </div>
            {!fund.loading && (
              <Badge
                variant="outline"
                className={
                  status
                    ? 'border-[#B8956A] text-[#B8956A] bg-[#B8956A]/10'
                    : 'border-black/10 text-[#1A1A1A]/55'
                }
              >
                {status || 'Not enrolled'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-[#1A1A1A]/55 mt-2">
            {fund.loading
              ? 'Checking your Auto-Fund status…'
              : status
                ? 'Your membership is on file. Charges, receipts and cancellation are managed on the Auto-Fund page.'
                : 'Automatic top-ups are optional. Review the tiers and enroll only if it suits how you work.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link to="/AutoFund">
              <Button variant="outline" className="border-[#B8956A]/35">Manage Auto-Fund</Button>
            </Link>
            <Link to="/PrepaidPurchase">
              <Button variant="outline" className="border-[#B8956A]/35">Buy prepaid credit</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}