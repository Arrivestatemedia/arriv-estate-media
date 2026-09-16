import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * DailyReportDownloadButton
 *
 * On-demand end-of-day report download. Calls the backend function
 * generateSalesRepDailyReport at the moment the button is clicked,
 * then downloads the returned HTML report as a file.
 *
 * Uses the deterministic Sales Health Score from salesHealthEngine.ts.
 */
export default function DailyReportDownloadButton({ salesMemberId, repName, variant = "outline", size = "sm" }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const result = await base44.functions.invoke('generateSalesRepDailyReport', {
        sales_member_id: salesMemberId,
      });
      const data = result?.data || result;

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Create a downloadable HTML file from the report
      const blob = new Blob([data.report_html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `EOD_Report_${repName || 'rep'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Report generated for ${data.rep_name || repName}`);
    } catch (err) {
      console.error('Report generation failed:', err);
      toast.error('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={loading}
      className="gap-1.5"
      style={{
        borderColor: '#B8956A',
        color: '#B8956A',
        backgroundColor: 'transparent',
      }}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {loading ? 'Generating...' : 'Download Report'}
    </Button>
  );
}