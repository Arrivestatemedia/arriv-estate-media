import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Download, Archive, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminPaymentStatements() {
  const [user, setUser] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);

  const queryClient = useQueryClient();

  React.useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    if (userRole !== 'admin') {
      window.location.href = "/";
    } else {
      setUser({ role: userRole });
    }
  }, []);

  const { data: currentStatements = [] } = useQuery({
    queryKey: ["current-statements"],
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      return await base44.entities.PaymentStatement.filter({
        is_archived: false,
        year: currentYear
      });
    },
  });

  const { data: archivedStatements = [] } = useQuery({
    queryKey: ["archived-statements", selectedYear],
    queryFn: async () => {
      return await base44.entities.PaymentStatement.filter({
        is_archived: true,
        year: selectedYear
      });
    },
  });

  const handleFileSelect = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Extract media partner name from filename (e.g., "John Smith.pdf" -> "John Smith")
      const fileName = file.name;
      const mediaPartnerName = fileName.replace(/\.[^/.]+$/, ""); // Remove file extension
      
      // Upload file to Base44
      const uploadResponse = await base44.integrations.Core.UploadFile({
        file: file
      });

      if (!uploadResponse.file_url) {
        throw new Error("Failed to upload file");
      }

      // Get form data
      const formData = new FormData(e.target);
      const mediaPartnerEmail = formData.get('media_partner_email');
      const paymentPeriodStart = formData.get('payment_period_start');
      const paymentPeriodEnd = formData.get('payment_period_end');
      const payoutDate = formData.get('payout_date');
      const totalGrossPaid = formData.get('total_gross_paid');

      // Call backend function to create payment statement record
      await base44.functions.invoke('uploadPaymentStatement', {
        media_partner_email: mediaPartnerEmail,
        media_partner_name: mediaPartnerName,
        file_url: uploadResponse.file_url,
        file_name: fileName,
        payment_period_start: paymentPeriodStart,
        payment_period_end: paymentPeriodEnd,
        payout_date: payoutDate,
        total_gross_paid: parseFloat(totalGrossPaid) || 0
      });

      setSuccess(`Payment statement for ${mediaPartnerName} uploaded successfully!`);
      setFile(null);
      e.target.reset();
      queryClient.invalidateQueries({ queryKey: ["current-statements"] });
    } catch (err) {
      setError(err.message || "Failed to upload statement");
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveYear = async () => {
    setLoading(true);
    setError("");

    try {
      // Archive all statements from the previous year
      const statementsToArchive = await base44.entities.PaymentStatement.filter({
        is_archived: false,
        year: selectedYear
      });

      const updatePromises = statementsToArchive.map(statement =>
        base44.asServiceRole.entities.PaymentStatement.update(statement.id, { 
          is_archived: true 
        })
      );

      await Promise.all(updatePromises);
      
      setSuccess(`Archived ${statementsToArchive.length} statements from ${selectedYear}`);
      queryClient.invalidateQueries({ queryKey: ["current-statements"] });
      queryClient.invalidateQueries({ queryKey: ["archived-statements"] });
      setArchiveDialogOpen(false);
    } catch (err) {
      setError("Failed to archive statements");
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Payment Statements</h1>
          <p className="text-[var(--text-secondary)] mt-1">Upload and manage weekly payment statements</p>
        </div>

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-900">{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-900">{success}</AlertDescription>
          </Alert>
        )}

        <Card className="border-[var(--border-color)]">
          <CardHeader>
            <CardTitle>Upload Weekly Statement</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="media_partner_email">Media Partner Email</Label>
                  <Input
                    id="media_partner_email"
                    name="media_partner_email"
                    type="email"
                    required
                    className="mt-1 border-[var(--border-color)]"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="payout_date">Payout Date</Label>
                  <Input
                    id="payout_date"
                    name="payout_date"
                    type="date"
                    required
                    className="mt-1 border-[var(--border-color)]"
                  />
                </div>

                <div>
                  <Label htmlFor="payment_period_start">Period Start</Label>
                  <Input
                    id="payment_period_start"
                    name="payment_period_start"
                    type="date"
                    required
                    className="mt-1 border-[var(--border-color)]"
                  />
                </div>

                <div>
                  <Label htmlFor="payment_period_end">Period End</Label>
                  <Input
                    id="payment_period_end"
                    name="payment_period_end"
                    type="date"
                    required
                    className="mt-1 border-[var(--border-color)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="total_gross_paid">Total Gross Paid (optional)</Label>
                  <Input
                    id="total_gross_paid"
                    name="total_gross_paid"
                    type="number"
                    step="0.01"
                    className="mt-1 border-[var(--border-color)]"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="file">PDF File (Named: FirstName LastName.pdf)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="mt-1 border-[var(--border-color)]"
                />
                <p className="text-xs text-[var(--text-secondary)] mt-2">
                  File name format: "John Smith.pdf" (so it matches the media partner)
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !file}
                className="w-full gap-2 bg-[var(--accent-color)] hover:bg-[var(--accent-hover)]"
              >
                <Upload className="w-4 h-4" />
                {loading ? "Uploading..." : "Upload Statement"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-[var(--border-color)]">
          <CardHeader>
            <CardTitle>Current Year Statements ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            {currentStatements.length === 0 ? (
              <p className="text-[var(--text-secondary)] text-sm">No statements uploaded yet</p>
            ) : (
              <div className="space-y-3">
                {currentStatements.map((statement) => (
                  <div key={statement.id} className="flex items-center justify-between p-3 border border-[var(--border-color)] rounded-lg">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{statement.media_partner_name}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {new Date(statement.payment_period_start).toLocaleDateString()} - {new Date(statement.payment_period_end).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={statement.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--border-color)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Archive Year-Old Statements</CardTitle>
            <Button
              variant="outline"
              onClick={() => setArchiveDialogOpen(true)}
              className="gap-2 border-[var(--border-color)]"
            >
              <Archive className="w-4 h-4" />
              Archive {new Date().getFullYear() - 1}
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--text-secondary)]">
              Move all statements from {new Date().getFullYear() - 1} to archive. They will be accessible for download by admins but not visible to media partners.
            </p>
          </CardContent>
        </Card>

        {archivedStatements.length > 0 && (
          <Card className="border-[var(--border-color)]">
            <CardHeader>
              <CardTitle>Archived Statements ({selectedYear})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {archivedStatements.map((statement) => (
                  <div key={statement.id} className="flex items-center justify-between p-3 border border-[var(--border-color)] rounded-lg">
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">{statement.media_partner_name}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {new Date(statement.payment_period_start).toLocaleDateString()} - {new Date(statement.payment_period_end).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={statement.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Statements</AlertDialogTitle>
            <AlertDialogDescription>
              Archive all statements from {new Date().getFullYear() - 1}? They will no longer be visible to media partners.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleArchiveYear}
            disabled={loading}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)]"
          >
            {loading ? "Archiving..." : "Archive"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}