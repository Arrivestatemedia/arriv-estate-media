import React, { useMemo, useState } from "react";
import { Download, ExternalLink, Megaphone } from "lucide-react";
import { AD_STATUS_LABELS, money } from "@/lib/propertyAds";

// The advertising portfolio table.
//
// Built from the supplied data-table component: five status filter pills that flood with their status
// colour when active, a hover band and hairline under each row, solid status badges, paging with a
// count meter and an export button with a light running round its ring. Restyled to Arriv's dark
// surface, gold accent and cream ink — and bound to real campaigns: every figure below comes from the
// records the server returned, so an empty portfolio says so rather than showing sample rows.
const PER_PAGE = 8;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "review", label: "In review" },
  { key: "done", label: "Completed" },
  { key: "attention", label: "Needs attention" },
];

function bucket(status) {
  if (["ACTIVE", "SUBMITTED", "PAUSED", "READY_TO_LAUNCH"].includes(status)) return "live";
  if (["PAID", "READY_FOR_REVIEW", "APPROVED", "AWAITING_PAYMENT", "AWAITING_CUSTOMER_APPROVAL", "DRAFT"].includes(status)) return "review";
  if (["COMPLETED", "CANCELLED", "REFUNDED", "REFUND_PENDING", "REJECTED"].includes(status)) return "done";
  if (status === "FAILED" || status === "REVIEW_REQUIRED") return "attention";
  return "review";
}

const BADGE_STYLE = {
  live: "linear-gradient(180deg, #C9A87B 0%, #E8D6BC 100%)",
  review: "linear-gradient(180deg, #E3C98F 0%, #F6E6C4 100%)",
  done: "linear-gradient(180deg, #6E6A64 0%, #948E86 100%)",
  attention: "linear-gradient(180deg, #E0A0A0 0%, #F3C9C9 100%)",
};

function shortId(id) {
  return String(id || "").replace(/^adc_/, "").slice(0, 8).toUpperCase() || "—";
}

export default function AdCampaignTable({ campaigns, loading, onOpen }) {
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    const base = { all: campaigns.length, live: 0, review: 0, done: 0, attention: 0 };
    campaigns.forEach((campaign) => {
      const key = bucket(campaign.status);
      if (base[key] !== undefined) base[key] += 1;
    });
    return base;
  }, [campaigns]);

  const filtered = useMemo(() => {
    const list = campaigns.filter((campaign) => filter === "all" || bucket(campaign.status) === filter);
    const value = (campaign) => {
      if (sortKey === "total") return Number(campaign.total_cents || 0);
      if (sortKey === "spent") return Number(campaign.spent_cents || campaign.budget?.spent_cents || 0);
      if (sortKey === "client") return String(campaign.client_name || campaign.client_email || "").toLowerCase();
      return new Date(campaign.created_at || 0).getTime();
    };
    return [...list].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === "asc" ? av - bv : bv - av;
    });
  }, [campaigns, filter, sortKey, dir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const sortBy = (key) => {
    if (sortKey === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(key === "total" || key === "spent" || key === "created" ? "desc" : "asc");
    }
    setPage(1);
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = "Campaign,Property,Client,Package,Total,Spend,Status";
    const lines = filtered.map((campaign) =>
      [
        shortId(campaign.campaign_id),
        `"${String(campaign.listing_id || "").replace(/"/g, "'")}"`,
        `"${String(campaign.client_name || campaign.client_email || "").replace(/"/g, "'")}"`,
        campaign.package_name || "",
        (Number(campaign.total_cents || 0) / 100).toFixed(2),
        (Number(campaign.spent_cents || campaign.budget?.spent_cents || 0) / 100).toFixed(2),
        AD_STATUS_LABELS[campaign.status] || campaign.status,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arriv-advertising-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="adt">
      <style>{`
        .adt { container-type: inline-size; container-name: adt; }
        .adt-card {
          border: 1px solid transparent; border-radius: 26px; overflow: hidden;
          background: linear-gradient(135deg, #1D1D1D 0%, #161616 100%) padding-box,
                      linear-gradient(#2A2A2A, #2A2A2A) border-box;
          color: #FFFBF5;
          font-family: Inter, system-ui, sans-serif;
        }
        .adt-head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 24px; padding: 22px 20px 14px; }
        .adt-titles { flex: 1 1 240px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
        .adt-title { margin: 0; font-size: clamp(1.25rem, 1rem + 1.4cqi, 1.9rem); font-weight: 500; letter-spacing: -0.5px; color: #F3EFE9; }
        .adt-meta { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #B9B2A6; }
        .adt-export { position: relative; margin-left: auto; }
        .adt-btn {
          position: relative; display: inline-flex; align-items: center; gap: 7px;
          min-height: 39px; padding: 9px 24px; border: 1px solid #35302A; border-radius: 999px;
          background: linear-gradient(180deg, #2A2724 0%, #191715 100%);
          color: #FFFBF5; font-size: 13px; font-weight: 600; cursor: pointer; overflow: hidden;
        }
        .adt-btn:hover { background: linear-gradient(180deg, #322E29 0%, #1D1B18 100%); }
        .adt-btn:disabled { opacity: 0.5; cursor: default; }
        .adt-beam-track {
          position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }
        .adt-beam {
          position: absolute; width: 40px; aspect-ratio: 1; offset-path: border-box; offset-distance: 0%;
          background: linear-gradient(90deg, #B8956A 0%, #E8D6BC 45%, #B8956A 100%);
          filter: blur(4px); animation: adt-beam 5s linear infinite;
        }
        @keyframes adt-beam { to { offset-distance: 100%; } }
        @media (prefers-reduced-motion: reduce) { .adt-beam { animation: none; } .adt-row, .adt-card { animation: none !important; } }
        .adt-toolwrap { padding: 0 20px 4px; }
        .adt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .adt-fcard {
          position: relative; isolation: isolate; overflow: hidden; flex: 1 1 110px; min-width: 0;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          min-height: 64px; padding: 8px 12px; border: 1px solid #2A2628; border-radius: 32px;
          background: linear-gradient(180deg, #202123 0%, #1E1F1F 50%, #161616 100%);
          color: #FFFCF5; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
          transition: color .3s ease, border-color .3s ease;
        }
        .adt-fcard::before {
          content: ''; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; border-radius: 50%;
          transform: translate(-50%, -50%); background: #B8956A; opacity: 0; z-index: 0; pointer-events: none;
          transition: width .85s cubic-bezier(.16,1,.3,1), height .85s cubic-bezier(.16,1,.3,1),
                      border-radius .85s cubic-bezier(.16,1,.3,1), opacity .28s ease;
        }
        .adt-fcard > * { position: relative; z-index: 1; }
        .adt-fcard:hover::before, .adt-fcard[aria-pressed="true"]::before { opacity: 1; width: 100%; height: 100%; border-radius: 32px; }
        .adt-fcard:hover, .adt-fcard[aria-pressed="true"] { color: #1A1A1A; border-color: #B8956A; }
        .adt-fcard:hover .adt-n, .adt-fcard[aria-pressed="true"] .adt-n { background: rgba(0,0,0,.16); color: #1A1A1A; }
        .adt-n { flex: 0 0 auto; display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.06); font-size: 13px; font-weight: 600; color: #B9B2A6; }
        .adt-wrap { margin: 0 20px; border-radius: 16px; overflow: hidden; border: 1px solid #242424; background: linear-gradient(#161616, #161616); }
        .adt-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
        .adt-th { padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: #9A948A; background: #1D1D1D; white-space: nowrap; }
        .adt-sort { display: inline-flex; align-items: center; gap: 5px; background: none; border: 0; padding: 0; color: inherit; font: inherit; cursor: pointer; text-transform: inherit; letter-spacing: inherit; }
        .adt-sort:hover { color: #FFFBF5; }
        .adt-row { cursor: pointer; }
        .adt-row td { padding: 12px 14px; border-top: 1px solid #1F1F1F; color: #FFFCF5; vertical-align: middle; }
        .adt-row:hover td { background: linear-gradient(90deg, #161616 0%, #222222 51%, #161616 100%); }
        .adt-row:focus-visible { outline: 2px solid #B8956A; outline-offset: -2px; }
        .adt-badge { display: inline-flex; align-items: center; height: 26px; padding: 0 11px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #1A1A1A; white-space: nowrap; }
        .adt-id { font-weight: 600; letter-spacing: 0.04em; }
        .adt-dim { color: #B9B2A6; }
        .adt-foot { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px 10px; padding: 16px 20px 20px; }
        .adt-range { font-size: 13px; color: #9A948A; }
        .adt-meter { width: min(100%, 220px); height: 6px; border-radius: 999px; overflow: hidden; background: linear-gradient(180deg, #2A2628 0%, #171717 100%); }
        .adt-meter span { display: block; height: 100%; background: linear-gradient(90deg, #B8956A 0%, #E8D6BC 100%); }
        .adt-pager { grid-row: 1 / span 2; grid-column: 2; display: flex; align-items: center; gap: 4px; }
        .adt-page { min-width: 32px; height: 32px; padding: 0 8px; border: 1px solid #2A2628; border-radius: 999px; background: #1A1819; color: #D6D0C6; font-size: 13px; font-weight: 600; cursor: pointer; }
        .adt-page[aria-current="page"] { border-color: #B8956A; color: #FFFBF5; background: linear-gradient(0deg, #121212 12%, #3F3A33 100%); }
        .adt-page:disabled { opacity: .35; cursor: default; }
        .adt-empty { display: grid; place-items: center; gap: 8px; padding: 40px 20px; text-align: center; }
        .adt-empty-t { font-size: 14px; font-weight: 600; color: #F3EFE9; }
        .adt-empty-p { margin: 0; max-width: 42ch; font-size: 13px; line-height: 1.55; color: #9A948A; }
        .adt-skel { display: grid; gap: 8px; padding: 12px; }
        .adt-skel-row { height: 46px; border-radius: 12px; border: 1px solid #1F1F1F; background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.06) 40%, rgba(255,255,255,0) 80%), #161616; background-size: 240% 100%, auto; animation: adt-shimmer 1.25s linear infinite; }
        @keyframes adt-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
        @container adt (width < 700px) { .adt-hide { display: none; } }
      `}</style>

      <div className="adt-card">
        <div className="adt-head">
          <div className="adt-titles">
            <h2 className="adt-title">advertising campaigns</h2>
            <p className="adt-meta">
              {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · {PER_PAGE} per page
            </p>
          </div>
          <span className="adt-export">
            <button type="button" className="adt-btn" onClick={exportCsv} disabled={!filtered.length}>
              <span className="adt-beam-track" aria-hidden="true"><span className="adt-beam"></span></span>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </span>
        </div>

        <div className="adt-toolwrap">
          <div className="adt-chips" role="group" aria-label="Filter campaigns by state">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="adt-fcard"
                aria-pressed={filter === item.key}
                onClick={() => {
                  setFilter(item.key);
                  setPage(1);
                }}
              >
                <span>{item.label}</span>
                <span className="adt-n">{counts[item.key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="adt-wrap">
          {loading ? (
            <div className="adt-skel">
              {[0, 1, 2, 3, 4].map((key) => (
                <div key={key} className="adt-skel-row" />
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="adt-empty">
              <Megaphone className="h-6 w-6 text-[#B8956A]" />
              <span className="adt-empty-t">{campaigns.length ? "No campaigns in this state" : "No campaigns yet"}</span>
              <p className="adt-empty-p">
                {campaigns.length
                  ? "Pick another filter to see the rest of the portfolio."
                  : "Advertising campaigns appear here the moment a customer buys one on a property page."}
              </p>
            </div>
          ) : (
            <table className="adt-table">
              <thead>
                <tr>
                  <th className="adt-th"><button type="button" className="adt-sort" onClick={() => sortBy("created")}>Campaign</button></th>
                  <th className="adt-th adt-hide"><button type="button" className="adt-sort" onClick={() => sortBy("client")}>Customer</button></th>
                  <th className="adt-th adt-hide">Package</th>
                  <th className="adt-th"><button type="button" className="adt-sort" onClick={() => sortBy("total")}>Total</button></th>
                  <th className="adt-th adt-hide"><button type="button" className="adt-sort" onClick={() => sortBy("spent")}>Spend</button></th>
                  <th className="adt-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((campaign) => {
                  const kind = bucket(campaign.status);
                  return (
                    <tr
                      key={campaign.campaign_id}
                      className="adt-row"
                      tabIndex={0}
                      onClick={() => onOpen(campaign.campaign_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onOpen(campaign.campaign_id);
                      }}
                    >
                      <td>
                        <span className="adt-id">{shortId(campaign.campaign_id)}</span>
                        <span className="adt-dim" style={{ display: "block", fontSize: 11 }}>
                          {campaign.public_url ? "Property page" : campaign.listing_id}
                        </span>
                      </td>
                      <td className="adt-hide">
                        <span>{campaign.client_name || "—"}</span>
                        <span className="adt-dim" style={{ display: "block", fontSize: 11 }}>{campaign.client_email}</span>
                      </td>
                      <td className="adt-hide">{campaign.package_name || "—"}</td>
                      <td>{money(campaign.total_cents)}</td>
                      <td className="adt-hide">{money(campaign.spent_cents ?? campaign.budget?.spent_cents ?? 0)}</td>
                      <td>
                        <span className="adt-badge" style={{ background: BADGE_STYLE[kind] }}>
                          {AD_STATUS_LABELS[campaign.status] || campaign.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="adt-foot">
          <span className="adt-range">
            {filtered.length ? `Showing ${slice.length} of ${filtered.length}` : "Nothing to show"}
          </span>
          <div className="adt-meter" aria-hidden="true">
            <span style={{ width: `${filtered.length ? (slice.length / filtered.length) * 100 : 0}%` }} />
          </div>
          <div className="adt-pager">
            <button type="button" className="adt-page" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} aria-label="Previous page">‹</button>
            {Array.from({ length: pages }, (_, index) => index + 1).slice(0, 6).map((number) => (
              <button key={number} type="button" className="adt-page" aria-current={number === safePage ? "page" : undefined} onClick={() => setPage(number)}>
                {number}
              </button>
            ))}
            <button type="button" className="adt-page" onClick={() => setPage(Math.min(pages, safePage + 1))} disabled={safePage >= pages} aria-label="Next page">›</button>
          </div>
        </div>
      </div>
    </section>
  );
}