import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { createPageUrl } from "../utils";

export default function ManualClosingInvoice() {
  const [user, setUser] = useState(null);
  const [bookingId, setBookingId] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [finalSalePrice, setFinalSalePrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const userRole = localStorage.getItem("user_role");
    if (userRole !== "admin") {
      window.location.href = createPageUrl("Dashboard");
    } else {
      setUser({ role: userRole });
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!bookingId.trim() || !closingDate.trim()) {
      setError("Booking ID and closing date are required");
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke("manualClosingInvoice", {
        bookingId: bookingId.trim(),
        closingDate: closingDate.trim(),
        finalSalePrice: finalSalePrice ? parseFloat(finalSalePrice) : null
      });

      setResult(response.data);
      setBookingId("");
      setClosingDate("");
      setFinalSalePrice("");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-8">Manual Closing Invoice</h1>

        <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
          <CardHeader>
            <CardTitle>Generate Final Closing Invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Booking ID *
                </label>
                <Input
                  type="text"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  placeholder="Enter booking ID"
                  disabled={loading}
                  className="border-[var(--border-color)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Closing Date *
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                    disabled={loading}
                    className="border-[var(--border-color)]"
                  />
                  <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Final Sale Price (Optional)
                </label>
                <Input
                  type="number"
                  value={finalSalePrice}
                  onChange={(e) => setFinalSalePrice(e.target.value)}
                  placeholder="Enter final sale price"
                  disabled={loading}
                  className="border-[var(--border-color)]"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                  {error}
                </div>
              )}

              {result && (
                <div className="p-3 bg-green-100 border border-green-300 rounded text-green-800 text-sm space-y-2">
                  <p className="font-semibold">✓ Invoice Generated Successfully</p>
                  <p>Invoice ID: {result.invoiceId}</p>
                  <p>Email sent to client via Brevo</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)]"
              >
                {loading ? "Generating Invoice..." : "Generate Closing Invoice"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}