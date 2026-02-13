import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileText } from "lucide-react";

export default function PaymentStatementsDropdown({ email }) {
  const [selectedStatement, setSelectedStatement] = useState(null);

  const { data: statements = [], isLoading } = useQuery({
    queryKey: ["payment-statements", email],
    queryFn: async () => {
      const allStatements = await base44.entities.PaymentStatement.filter({
        media_partner_email: email,
        is_archived: false
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
      a.download = `Payment_Statement_${statement.payout_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-[var(--text-secondary)]">Loading statements...</div>;
  }

  if (statements.length === 0) {
    return (
      <div className="text-sm text-[var(--text-secondary)]">
        No payment statements available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          Select Payment Statement
        </label>
        <Select
          value={selectedStatement?.id || ""}
          onValueChange={(id) => {
            const statement = statements.find((s) => s.id === id);
            setSelectedStatement(statement);
          }}
        >
          <SelectTrigger className="border-[#B8956A]/30">
            <SelectValue placeholder="Choose a statement..." />
          </SelectTrigger>
          <SelectContent>
            {statements.map((statement) => (
              <SelectItem key={statement.id} value={statement.id}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Payout: {new Date(statement.payout_date).toLocaleDateString()}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedStatement && (
        <Card className="border-[#B8956A]/20 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm text-[var(--text-primary)]">
              Payment Statement Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Payout Date:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {new Date(selectedStatement.payout_date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Period:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {new Date(selectedStatement.period_start).toLocaleDateString()} to{" "}
                {new Date(selectedStatement.period_end).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Gigs Completed:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {selectedStatement.gigs_completed}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Gross Amount:</span>
              <span className="font-bold text-green-600">
                ${selectedStatement.gross_amount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Payment Method:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {selectedStatement.payout_method === "zelle" ? "Zelle" : "Bank Account"}
              </span>
            </div>
            <Button
              onClick={() => handleDownload(selectedStatement)}
              className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}