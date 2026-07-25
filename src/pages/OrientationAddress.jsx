import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPageUrl } from "../utils";
import { Loader2, MapPin } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export default function OrientationAddress() {
  const navigate = useNavigate();
  const [data, setData] = useState({ mailing_address: "", city: "", state: "", zip: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const email = localStorage.getItem("user_email");
    if (!email) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await base44.functions.invoke("getCoverageArea", { email });
        const rec = res?.data || {};
        setData({
          mailing_address: rec.mailing_address || "",
          city: rec.city || "",
          state: rec.state || "",
          zip: rec.zip || "",
        });
      } catch (_e) {
        // ignore — empty form
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const incomplete =
    !data.mailing_address.trim() ||
    !data.city.trim() ||
    !data.state.trim() ||
    !data.zip.trim();

  const handleContinue = async () => {
    const email = localStorage.getItem("user_email");
    if (!email) {
      navigate(createPageUrl("SignIn"));
      return;
    }
    if (incomplete) return;
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveMediaPartnerAddress", { email, ...data });
      if (res?.data?.success) {
        navigate(createPageUrl("MediaPartnerTermsConditions"));
        return;
      }
      setError(res?.data?.error || "Could not save your address.");
    } catch (e) {
      setError(e?.message || "Could not save your address.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-color)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle className="text-3xl text-[var(--text-primary)] flex items-center gap-2">
              <MapPin className="w-7 h-7 text-[var(--accent-color)]" />
              Your Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-[var(--text-secondary)]">
              We use your home address to show you gigs in your state. Please confirm
              your street address, city, state, and ZIP.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[var(--text-primary)] text-xs">
                  Street Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={data.mailing_address}
                  onChange={(e) => set("mailing_address", e.target.value)}
                  placeholder="123 Main St"
                  className="border-[var(--border-color)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[var(--text-primary)] text-xs">
                  City <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={data.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="Phoenix"
                  className="border-[var(--border-color)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[var(--text-primary)] text-xs">
                  State <span className="text-red-500">*</span>
                </Label>
                <select
                  value={data.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="flex h-11 md:h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm md:text-sm"
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[var(--text-primary)] text-xs">
                  ZIP <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={data.zip}
                  onChange={(e) => set("zip", e.target.value)}
                  placeholder="85001"
                  className="border-[var(--border-color)]"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button
              onClick={handleContinue}
              disabled={saving || incomplete}
              className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}