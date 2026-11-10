import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { fetchMarkets } from '@/lib/professionalVisibility';

// Internal links from the directory into the city pages that actually exist. Nothing is rendered
// when no market is eligible, so the directory never advertises an empty location page.
export default function MarketLinks() {
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    let active = true;
    fetchMarkets()
      .then((result) => active && setMarkets(result.markets || []))
      .catch(() => active && setMarkets([]));
    return () => {
      active = false;
    };
  }, []);

  if (markets.length === 0) return null;

  return (
    <div className="mt-10 border-t border-[#1A1A1A]/10 pt-6">
      <h2 className="font-serif text-lg text-[#1A1A1A]">Browse by city</h2>
      <div className="flex flex-wrap gap-2 mt-3">
        {markets.map((market) => (
          <Link
            key={market.slug}
            to={market.path}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-white border border-[#1A1A1A]/10 text-[#1A1A1A]/70 hover:border-[#B8956A]"
          >
            <MapPin className="w-3 h-3 text-[#B8956A]" />
            {market.city}, {market.state}
            <span className="text-[#1A1A1A]/35">{market.listings}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}