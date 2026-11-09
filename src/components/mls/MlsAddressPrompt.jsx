import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";

/**
 * Asks the customer for the rest of the property address when the one on the booking cannot place the
 * property ("Bethesda, MD"). Nothing is submitted from here: the completed address is checked against
 * the MLS service-area map again, and only a resolved — or explicitly reviewed — result gets published.
 */
export default function MlsAddressPrompt({ message, initial, busy, note, onCheck }) {
  const [street, setStreet] = useState(initial?.address && /^\d/.test(initial.address) ? initial.address.split(",")[0] : "");
  const [city, setCity] = useState(initial?.city || "");
  const [state, setState] = useState(String(initial?.state || "").toUpperCase());
  const [zip, setZip] = useState(initial?.zip || "");

  const ready = street.trim().length > 2
    && city.trim().length > 1
    && /^[A-Za-z]{2}$/.test(state.trim())
    && /^\d{5}$/.test(zip.trim());

  const submit = () => {
    if (!ready || busy) return;
    onCheck(`${street.trim()}, ${city.trim()}, ${state.trim().toUpperCase()} ${zip.trim()}`);
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-[#1A1A1A] flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-[#B8956A]" /> Let's complete the property address
        </p>
        <p className="text-xs text-[#1A1A1A]/70 mt-1 leading-relaxed">{message}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          className="sm:col-span-2"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="Street address, e.g. 7001 Arlington Rd"
          autoComplete="street-address"
        />
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" autoComplete="address-level2" />
        <div className="grid grid-cols-3 gap-2">
          <Input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="GA"
            maxLength={2}
            autoComplete="address-level1"
          />
          <Input
            className="col-span-2"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
            placeholder="ZIP code"
            inputMode="numeric"
            autoComplete="postal-code"
          />
        </div>
      </div>

      {note && <p className="text-xs text-amber-900">{note}</p>}

      <Button
        type="button"
        onClick={submit}
        disabled={!ready || busy}
        className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        Check this address
      </Button>
    </div>
  );
}