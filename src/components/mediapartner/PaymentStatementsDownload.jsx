import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentStatementsDownload({ userEmail }) {
  const { data: statements = [] } = useQuery({
    queryKey: ["payment-statements", userEmail],
    queryFn: async () => {
      const allStatements = await base44.entities.PaymentStatement.filter({
        media_partner_email: userEmail,
        is_archived: false
      });
      // Sort by payout date descending (newest first)
      return allStatements.sort((a, b) => new Date(b.payout_date) - new Date(a.payout_date));
    },
    enabled: !!userEmail,
  });

  const handleDownload = (statement) => {
    const link = document.createElement("a");
    link.href = statement.file_url;
    link.download = statement.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (statements.length === 0) {
    return (
      <Card className="border-[var(--border-color)]">
        <CardHeader>
          <CardTitle>Weekly Payment Statements</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--text-secondary)] text-sm">
            No payment statements available yet. They will appear here each week.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--border-color)]">
      <CardHeader>
        <CardTitle>Weekly Payment Statements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            Select a statement to download
          </label>
          <div className="flex gap-2 flex-wrap">
            {statements.map((statement) => (
              <Button
                key={statement.id}
                variant="outline"
                onClick={() => handleDownload(statement)}
                className="gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--accent-color)]/10 hover:text-[var(--accent-color)]"
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs">
                  {new Date(statement.payout_date).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
                <Download className="w-4 h-4" />
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Statements are archived at the end of each year. Previous year statements can be requested from support.
        </p>
      </CardContent>
    </Card>
  );
}