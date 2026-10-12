import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Home } from "lucide-react";
import PropertyCard from "@/components/property/PropertyCard";
import { LISTING_STATUS_LABELS } from "@/lib/propertyVisibility";

// Public property directory. Only approved, published, currently authorized listings are
// returned by the server — a sold, withdrawn, expired or unconfirmed listing never appears.
export default function PropertyDirectory() {
  const [filters, setFilters] = useState({ q: "", min_price: "", max_price: "", min_bedrooms: "", min_bathrooms: "", status: "" });
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  const search = useCallback(async (nextCursor = null) => {
    setLoading(true);
    try {
      const payload = { ...filters, limit: 12 };
      if (nextCursor) payload.cursor = nextCursor;
      Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
      const res = await base44.functions.invoke("searchProperties", payload);
      const data = res?.data || res;
      if (data?.feature_disabled) { setDisabled(true); setResults([]); setTotal(0); return; }
      setDisabled(false);
      setTotal(data?.total || 0);
      setCursor(data?.next_cursor || null);
      setResults((prev) => (nextCursor ? [...prev, ...(data?.results || [])] : (data?.results || [])));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { search(null); }, [search]);

  const set = (k) => (e) => setFilters((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <header className="bg-[#1A1A1A] px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-[#FFFBF5] font-serif text-lg tracking-wide">Arriv Estate Media</Link>
          <a
            href="https://arrivestatemedia.com"
            className="text-xs font-semibold px-3.5 py-2 rounded-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] transition-colors"
          >
            Need media services?
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-3xl sm:text-4xl font-serif text-[#1A1A1A] mb-2">Properties</h1>
        <p className="text-sm text-[#1A1A1A]/55 mb-8">
          Photographed and delivered by Arriv Estate Media. Only listings approved and published by their authorized customer appear here.
        </p>

        {disabled ? (
          <div className="rounded-2xl border border-[#B8956A]/25 bg-white p-10 text-center">
            <Home className="w-10 h-10 text-[#B8956A] mx-auto mb-3" />
            <p className="text-[#1A1A1A] font-medium mb-1">The property directory is not yet available</p>
            <p className="text-sm text-[#1A1A1A]/55">This feature is still being certified.</p>
          </div>
        ) : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); search(null); }} className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              <input value={filters.q} onChange={set("q")} placeholder="City, state or ZIP" className="sm:col-span-2 rounded-lg border border-black/10 px-3 py-2 text-sm bg-white" />
              <input type="number" value={filters.min_price} onChange={set("min_price")} placeholder="Min price" className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white" />
              <input type="number" value={filters.max_price} onChange={set("max_price")} placeholder="Max price" className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white" />
              <input type="number" value={filters.min_bedrooms} onChange={set("min_bedrooms")} placeholder="Beds+" className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white" />
              <input type="number" value={filters.min_bathrooms} onChange={set("min_bathrooms")} placeholder="Baths+" className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white" />
              <select value={filters.status} onChange={set("status")} className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white">
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
              <Button type="submit" className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
                <Search className="w-4 h-4 mr-2" /> Search
              </Button>
            </form>

            {loading && results.length === 0 ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#B8956A]" /></div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-black/5 bg-white p-10 text-center">
                <p className="text-[#1A1A1A] font-medium mb-1">No properties match your search</p>
                <p className="text-sm text-[#1A1A1A]/55">Try a different location, price range or status.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-[#1A1A1A]/50 mb-4">{total} propert{total === 1 ? "y" : "ies"} found</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {results.map((p) => <PropertyCard key={p.listing_id} property={p} />)}
                </div>
                {cursor && (
                  <div className="text-center mt-8">
                    <Button onClick={() => search(cursor)} disabled={loading} variant="outline" className="border-[#B8956A]/40 text-[#1A1A1A]">
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-[#1A1A1A]/45 mt-10">
              Listings are shown as {["active", "pending"].map((s) => LISTING_STATUS_LABELS[s].toLowerCase()).join(" or ")} only, and must be reconfirmed periodically by their listing contact.
            </p>
          </>
        )}
      </div>
    </div>
  );
}