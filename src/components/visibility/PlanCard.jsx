import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/professionalVisibility';

// One recurring plan, as offered. Nothing here can start a charge: the button calls the parent, and
// the backend refuses a checkout while the subscription switch is off.
export default function PlanCard({ plan, current, canPurchase, onChoose, busy }) {
  const isCurrent = current === plan.product_key;
  return (
    <div className={`rounded-2xl border bg-white p-6 flex flex-col ${isCurrent ? 'border-[#B8956A] shadow-sm' : 'border-[#1A1A1A]/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl text-[#1A1A1A]">{plan.name}</h3>
          <p className="text-sm text-[#1A1A1A]/55 mt-1">{plan.tagline}</p>
        </div>
        {isCurrent && (
          <span className="text-[11px] uppercase tracking-wide px-2 py-1 rounded-full bg-[#B8956A]/15 text-[#8C6F45] shrink-0">
            Current
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="font-serif text-3xl text-[#1A1A1A]">{formatPrice(plan.price_cents)}</span>
        <span className="text-sm text-[#1A1A1A]/50">/ month</span>
      </div>
      <p className="text-xs text-[#1A1A1A]/45 mt-1">Renews monthly until cancelled.</p>

      <ul className="mt-5 space-y-2 flex-1">
        {(plan.features || []).map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-[#1A1A1A]/75">
            <Check className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-2">
        <Button
          className="w-full bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]"
          disabled={!canPurchase || isCurrent || busy}
          onClick={() => onChoose(plan.product_key)}
        >
          {isCurrent ? 'Your plan' : busy ? 'Starting…' : canPurchase ? `Choose ${plan.name}` : 'Checkout unavailable'}
        </Button>
        {plan.seats_included > 1 && (
          <p className="text-xs text-[#1A1A1A]/45">
            Includes {plan.seats_included} agent seats
            {plan.seat_policy === 'per_seat' && plan.additional_seat_price_label && plan.additional_seat_price_cents > 0
              ? `, additional seats ${plan.additional_seat_price_label}/month each.`
              : '.'}
          </p>
        )}
      </div>
    </div>
  );
}