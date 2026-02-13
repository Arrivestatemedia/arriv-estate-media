import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Archive } from "lucide-react";

export default function AdminArchivedStatements() {
  const [user, setUser] = useState(null);

  React.useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    if (userRole !== 'admin') {
      window.location.href = "/";
    } else {
      setUser({ role: userRole });
    }
  }, []);

  const { data: statements = [], isLoading } = useQuery({
    queryKey: ["archived-statements"],
    queryFn: async () => {
      const allStatements = await base44.entities.PaymentStatement.filter({
        is_archived: true
      });
      return allStatements.sort((a, b) => new Date(b.payout_date) - new Date(a.payout_date));
    },
  });

  const handleDownload = async (statement) => {
    try {
      const response = await fetch(statement.pdf_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Archived_Statement_${statement.media_partner_name}_${statement.payout_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  if (!user || user?.role !== "admin") {
    return null;
  }

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Archived Payment Statements</h1>
          <p className="text-[var(--text-secondary)] mt-1">Payment statements older than 1 year</p>
        </div>

        <div className="grid gap-4">
          {statements.length === 0 ? (
            <Card className="border-[var(--border-color)]">
              <CardContent className="pt-6 text-center text-[var(--text-secondary)]">
                No archived statements
              </CardContent>
            </Card>
          ) : (
            statements.map((statement) => (
              <Card key={statement.id} className="border-[var(--border-color)]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[var(--text-primary)] flex items-center gap-2">
                      <Archive className="w-5 h-5" />
                      {statement.media_partner_name}
                    </CardTitle>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {new Date(statement.payout_date).toLocaleDateString()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-[var(--text-secondary)]">Period</p>
                      <p className="font-medium text-[var(--text-primary)]">
                        {new Date(statement.period_start).toLocaleDateString()} - {new Date(statement.period_end).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--text-secondary)]">Gigs</p>
                      <p className="font-medium text-[var(--text-primary)]">{statement.gigs_completed}</p>
                    </div>
                    <div>
                      <p className="text-[var(--text-secondary)]">Amount</p>
                      <p className="font-bold text-green-600">${statement.gross_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--text-secondary)]">Method</p>
                      <p className="font-medium text-[var(--text-primary)]">
                        {statement.payout_method === "zelle" ? "Zelle" : "Bank Account"}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDownload(statement)}
                    className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}