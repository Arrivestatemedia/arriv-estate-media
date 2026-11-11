import React from "react";

/**
 * Renders the real result a concierge action returned.
 * It only ever displays fields the server sent — it never invents a value.
 */

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Row({ title, meta, badge }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-[#c8a87c]/12 py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-[#f6f1e8]">{title}</p>
        {meta ? <p className="mt-0.5 text-[11px] text-[#f6f1e8]/50">{meta}</p> : null}
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full border border-[#c8a87c]/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#d9bd95]">
          {badge}
        </span>
      ) : null}
    </li>
  );
}

function Section({ label, children }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]/80">{label}</p>
      <ul className="rounded-xl border border-[#c8a87c]/15 bg-black/25 px-3 py-1">{children}</ul>
    </div>
  );
}

export default function ConciergeResultCard({ data }) {
  if (!data || typeof data !== "object") return null;

  if (Array.isArray(data.bookings) && data.bookings.length) {
    return (
      <Section label="Your bookings">
        {data.bookings.map((booking, index) => (
          <Row
            key={booking.booking_id || index}
            title={booking.address || "Property"}
            meta={[booking.date, booking.time, String(booking.package || "").replace(/_/g, " "), booking.status].filter(Boolean).join(" · ")}
            badge={booking.total_price != null ? `$${booking.total_price}` : null}
          />
        ))}
      </Section>
    );
  }

  if (Array.isArray(data.properties) && data.properties.length) {
    return (
      <Section label="Your property pages">
        {data.properties.map((property, index) => (
          <Row
            key={property.listing_id || index}
            title={property.address || "Property"}
            meta={[
              property.views != null ? `${property.views} views` : property.views_30d != null ? `${property.views_30d} views / 30d` : null,
              property.leads != null ? `${property.leads} leads` : null,
            ].filter(Boolean).join(" · ")}
            badge={property.publication_state ? String(property.publication_state).toLowerCase() : null}
          />
        ))}
      </Section>
    );
  }

  if (Array.isArray(data.galleries) && data.galleries.length) {
    return (
      <Section label="Delivered galleries">
        {data.galleries.map((gallery, index) => (
          <Row
            key={gallery.job_id || index}
            title={gallery.address || gallery.title || "Shoot"}
            meta={[gallery.shoot_date, String(gallery.package || "").replace(/_/g, " ")].filter(Boolean).join(" · ")}
            badge="ready"
          />
        ))}
      </Section>
    );
  }

  if (Array.isArray(data.invoices) && data.invoices.length) {
    return (
      <Section label="Invoices">
        {data.invoices.map((invoice, index) => (
          <Row
            key={invoice.invoice_id || index}
            title={`${invoice.invoice_number || "Invoice"} · $${Number(invoice.amount || 0).toFixed(2)}`}
            meta={[invoice.invoice_date, String(invoice.invoice_type || "").replace(/_/g, " ")].filter(Boolean).join(" · ")}
            badge={invoice.payment_status}
          />
        ))}
      </Section>
    );
  }

  if (data.total_cents != null && data.package_id) {
    return (
      <div className="mt-1 rounded-xl border border-[#c8a87c]/25 bg-[#c8a87c]/8 px-3 py-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]">Prepared quote</p>
        <p className="mt-1 font-serif text-2xl text-[#f6f1e8]">{money(data.total_cents)}</p>
        <p className="mt-1 text-[11px] text-[#f6f1e8]/55">
          {String(data.package_id || "").replace(/_/g, " ")}
          {data.preferred_discount_cents ? ` · ${money(data.preferred_discount_cents)} Preferred discount applied` : ""}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-[#f6f1e8]/45">{data.note}</p>
      </div>
    );
  }

  const summary = [];
  if (data.wallet?.balance_label) summary.push(["Prepaid balance", data.wallet.balance_label]);
  if (data.auto_fund?.status) summary.push(["Auto-Fund", `${data.auto_fund.status} · $${data.auto_fund.amount}`]);
  if (data.outstanding_invoices != null) summary.push(["Outstanding invoices", `${data.outstanding_invoices} ($${Number(data.outstanding_total || 0).toFixed(2)})`]);
  if (data.total_saved_label) summary.push(["Saved with Preferred", data.total_saved_label]);
  if (data.membership?.plan) summary.push(["Membership", String(data.membership.plan).replace(/_/g, " ")]);
  if (data.totals?.views != null) summary.push(["Views", data.totals.views, "Leads", data.totals.leads]);

  if (summary.length) {
    return (
      <div className="mt-1 rounded-xl border border-[#c8a87c]/15 bg-black/25 px-3 py-2">
        {summary.map(([label, value], index) => (
          <div key={`${label}-${index}`} className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[11px] uppercase tracking-wide text-[#f6f1e8]/45">{label}</span>
            <span className="text-[13px] text-[#f6f1e8]">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}