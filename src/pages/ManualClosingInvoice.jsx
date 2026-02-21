import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Calendar, File } from "lucide-react";
import { createPageUrl } from "../utils";

export default function ManualClosingInvoice() {
  const [user, setUser] = useState(null);
  const [bookingId, setBookingId] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [finalSalePrice, setFinalSalePrice] = useState("");
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [fileName, setFileName] = useState("");
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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setInvoiceFile(file);
      setFileName(file.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!bookingId.trim() || !closingDate.trim() || !invoiceFile) {
      setError("Booking ID, closing date, and invoice file are required");
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke("uploadAndSendClosingInvoice", {
        bookingId: bookingId.trim(),
        closingDate: closingDate.trim(),
        finalSalePrice: finalSalePrice ? parseFloat(finalSalePrice) : null,
        invoiceFile: invoiceFile
      });

      setResult(response.data);
      setBookingId("");
      setClosingDate("");
      setFinalSalePrice("");
      setInvoiceFile(null);
      setFileName("");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to upload and send invoice");
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
            <CardTitle>Upload & Send Final Closing Invoice</CardTitle>
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
                <p className="text-xs text-[var(--text-secondary)] mt-1">Will pull client and job info to send email</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Invoice File (PDF) *
                </label>
                <label className="border-2 border-dashed border-[var(--border-color)] rounded-lg p-6 cursor-pointer hover:bg-[var(--accent-color)]/5 transition">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-5 h-5 text-[var(--accent-color)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {fileName || "Click to upload invoice PDF"}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Closing Date *
                </label>
                <Input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  disabled={loading}
                  className="border-[var(--border-color)]"
                />
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
                  <p className="font-semibold">✓ Invoice Sent Successfully</p>
                  <p>Email sent to: {result.clientEmail}</p>
                  <p>File stored in Google Drive</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)]"
              >
                {loading ? "Uploading & Sending..." : "Upload & Send Invoice"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}