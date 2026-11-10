import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { withCustomerSession, redirectIfSessionExpired } from "@/lib/customerSession";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Receipt, CreditCard } from "lucide-react";
import moment from "moment";
import CollapsibleList from "@/components/shared/CollapsibleList";

const TYPE_LABELS = {
  pay_up_front: "Invoice",
  deposit: "Deposit Invoice",
  final_closing: "Closing Invoice",
  receipt: "Receipt",
};

export default function ClientInvoices({ email, compact = false }) {
  const { data: invoices = [], isLoading, error, refetch } = useQuery({
    queryKey: ["clientInvoices", email],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke(
          "getClientInvoices",
          withCustomerSession({ clientEmail: email }),
        );
        return res.data?.invoices || [];
      } catch (err) {
        // No valid session yet (e.g. signed in before sessions existed) → sign in again.
        if (!redirectIfSessionExpired(err)) throw err;
        return [];
      }
    },
    enabled: !!email,
  });

  if (error) return <div className="mt-6 text-sm text-destructive"><p>Your invoices could not be loaded. Please retry.</p><Button variant="outline" className="mt-2" onClick={() => refetch()}>Retry invoices</Button></div>;
  if (isLoading || invoices.length === 0) return null;

  const open = (url, invoice, action) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    base44.functions
      .invoke("trackInvoiceEngagement", withCustomerSession({ invoiceId: invoice.id, action }))
      .catch(() => {});
  };

  return (
    <div className={compact ? "" : "mt-10"}>
      {!compact && (
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-4">Invoices &amp; Receipts</h2>
      )}
      <CollapsibleList
        items={invoices}
        initialCount={3}
        expandLabel="Show all invoices"
        listClassName="space-y-3"
        renderItem={(inv) => {
          const isPaid = inv.status === "paid";
          const Icon = isPaid ? Receipt : FileText;
          const label = TYPE_LABELS[inv.invoiceType] || "Document";

          return (
            <Card
              key={inv.id}
              className="border-2 border-[var(--border-color)] bg-[var(--card-bg)] hover:shadow-lg transition-shadow"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-color)]/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-[var(--accent-color)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] truncate">
                        {inv.address || label}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {label}
                        {inv.invoiceNumber ? ` #${inv.invoiceNumber}` : ""}
                        {inv.invoiceDate ? ` · ${moment(inv.invoiceDate).format("MMM D, YYYY")}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-[var(--text-primary)]">${inv.amount}</p>
                    <Badge
                      className={
                        isPaid
                          ? "mt-1 bg-[var(--accent-color)]/15 text-[var(--accent-color)]"
                          : "mt-1 bg-yellow-100 text-yellow-800"
                      }
                    >
                      {isPaid ? "PAID" : inv.payAtClosing ? "DUE AT CLOSING" : "UNPAID"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isPaid ? (
                    inv.receiptUrl ? (
                      <Button
                        size="sm"
                        onClick={() => open(inv.receiptUrl, inv, "view_receipt")}
                        className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
                      >
                        <Receipt className="w-4 h-4 mr-2" />
                        View Receipt
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {inv.payLinkUrl ? (
                        <Button
                          size="sm"
                          onClick={() => open(inv.payLinkUrl, inv, "pay")}
                          className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Pay ${inv.amount}
                        </Button>
                      ) : null}
                      {inv.viewUrl ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => open(inv.viewUrl, inv, "view_invoice")}
                          className="text-[var(--accent-color)] border-[var(--border-color)]"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          View Invoice
                        </Button>
                      ) : null}
                      {inv.payAtClosing && !inv.payLinkUrl ? (
                        <p className="text-sm text-[var(--text-secondary)] self-center">
                          This invoice is due at closing.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        }}
      />
    </div>
  );
}