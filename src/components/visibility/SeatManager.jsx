import React, { useEffect, useState } from 'react';
import { Minus, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/professionalVisibility';

// Additional brokerage seats. The backend refuses any change while billing is switched off, so this
// panel explains the state instead of pretending the control works.
export default function SeatManager({ seat, busy, onUpdate }) {
  const purchased = Number(seat?.seats_purchased || 0);
  const [value, setValue] = useState(purchased);

  useEffect(() => {
    setValue(purchased);
  }, [purchased]);

  if (!seat) return null;

  const min = Number(seat.min_seats ?? 0);
  const max = Number(seat.max_seats ?? 50);
  const seatPriceCents = Number(seat.seat_price_cents || 0);
  const included = Number(seat.seats_included || 0);
  // The server holds the current monthly total, so the base plan price is derived from it rather than
  // being assumed here.
  const basePlanCents = Math.max(0, Number(seat.monthly_total_cents || 0) - purchased * seatPriceCents);
  const projected = basePlanCents + value * seatPriceCents;
  const changed = value !== purchased;

  const step = (delta) => setValue((current) => Math.min(max, Math.max(min, current + delta)));

  return (
    <div className="rounded-2xl border border-[#1A1A1A]/10 bg-white p-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-[#B8956A]" />
        <h2 className="font-serif text-xl text-[#1A1A1A]">Agent seats</h2>
      </div>

      <p className="text-sm text-[#1A1A1A]/60 mt-1">
        Your plan includes {included} seats. Additional seats are {formatPrice(seatPriceCents)} per seat, per month.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={!seat.can_change || value <= min}
            onClick={() => step(-1)}
            aria-label="Remove a seat"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span className="min-w-[3rem] text-center font-serif text-2xl text-[#1A1A1A]">{value}</span>
          <Button
            variant="outline"
            size="icon"
            disabled={!seat.can_change || value >= max}
            onClick={() => step(1)}
            aria-label="Add a seat"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <p className="text-sm text-[#1A1A1A]/70">
          {included + value} seats total · {formatPrice(projected)}/month
        </p>
      </div>

      <Button
        className="mt-4 bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]"
        disabled={!seat.can_change || !changed || busy === 'seats'}
        onClick={() => onUpdate(value)}
      >
        {busy === 'seats' ? 'Updating seats…' : changed ? 'Update seats' : 'No change'}
      </Button>

      {!seat.can_change && seat.blocked_reason && (
        <p className="text-xs text-[#1A1A1A]/45 mt-3">{seat.blocked_reason}</p>
      )}
      {changed && seat.can_change && (
        <p className="text-xs text-[#1A1A1A]/45 mt-3">
          Added seats are billed immediately at the prorated amount. Removed seats are credited on your next invoice.
        </p>
      )}
    </div>
  );
}