// Server-rendered HTML for the Phase 4 public pages (agent, brokerage and geographic discovery).
//
// The Cloudflare Worker proxies a public path to this renderer so a crawler receives complete HTML
// without running JavaScript. Everything rendered here comes from records that already passed the
// publication rules — this module renders, it does not decide what is publishable.

function esc(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: any): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 'Price not published';
  return `$${number.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#FFFBF5; color:#1A1A1A; font-family: Inter, Arial, Helvetica, sans-serif; line-height:1.55; -webkit-font-smoothing:antialiased; }
  a { color:#8C6F45; text-decoration:none; }
  a:hover { text-decoration:underline; }
  header.band { background:#1A1A1A; padding:16px 0; }
  .wrap { max-width:1040px; margin:0 auto; padding:0 20px; }
  .brand { color:#FFFBF5; font-family: Georgia, "Playfair Display", serif; letter-spacing:.04em; font-size:18px; }
  main { padding:40px 0 56px; }
  h1 { font-family: Georgia, "Playfair Display", serif; font-size:40px; line-height:1.15; margin:8px 0 10px; font-weight:600; }
  h2 { font-family: Georgia, "Playfair Display", serif; font-size:24px; margin:36px 0 12px; font-weight:600; }
  .eyebrow { text-transform:uppercase; letter-spacing:.2em; font-size:11px; color:#B8956A; margin:0; }
  .crumbs { font-size:12px; color:rgba(26,26,26,.5); margin-bottom:18px; }
  .crumbs a { color:rgba(26,26,26,.6); }
  .muted { color:rgba(26,26,26,.6); }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
  .card { background:#fff; border:1px solid rgba(26,26,26,.1); border-radius:16px; padding:18px; }
  .card h3 { margin:0 0 4px; font-size:17px; font-weight:600; }
  .price { color:#8C6F45; margin-top:8px; }
  .badge { display:inline-block; font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:rgba(184,149,106,.15); color:#8C6F45; border-radius:999px; padding:4px 10px; }
  .cta { display:inline-block; margin-top:18px; background:#1A1A1A; color:#FFFBF5; padding:12px 22px; border-radius:10px; font-weight:500; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .chip { font-size:12px; border:1px solid rgba(26,26,26,.12); background:#fff; border-radius:999px; padding:5px 12px; color:rgba(26,26,26,.7); }
  .disclosure { font-size:11px; color:rgba(26,26,26,.45); margin-top:28px; max-width:780px; }
  footer { border-top:1px solid rgba(26,26,26,.1); padding:22px 0 40px; font-size:12px; color:rgba(26,26,26,.45); }
`;

function head(seo: any): string {
  const social = seo?.social || {};
  return [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${esc(seo?.title || '')}</title>`,
    `<meta name="description" content="${esc(seo?.meta_description || '')}" />`,
    `<meta name="robots" content="${esc(seo?.robots || 'noindex, nofollow')}" />`,
    seo?.canonical_url ? `<link rel="canonical" href="${esc(seo.canonical_url)}" />` : '',
    ...Object.entries(social)
      .filter(([, value]) => !!value)
      .map(([key, value]) => `<meta property="${esc(key)}" content="${esc(value)}" />`),
    seo?.structured_data ? `<script type="application/ld+json">${JSON.stringify(seo.structured_data)}</script>` : '',
    `<style>${STYLES}</style>`,
  ]
    .filter(Boolean)
    .join('\n');
}

function breadcrumbs(items: any[]): string {
  if (!items?.length) return '';
  return `<nav class="crumbs" aria-label="Breadcrumb">${items
    .map((item, index) => (index === items.length - 1
      ? `<span>${esc(item.name)}</span>`
      : `<a href="${esc(item.url)}">${esc(item.name)}</a> <span aria-hidden="true">/</span> `))
    .join('')}</nav>`;
}

function listingCard(listing: any): string {
  const details = [
    listing.bedrooms ? `${listing.bedrooms} bd` : '',
    listing.bathrooms ? `${listing.bathrooms} ba` : '',
    listing.square_footage ? `${listing.square_footage} sqft` : '',
  ].filter(Boolean).join(' · ');
  return `<article class="card">
    ${listing.placement_label ? `<span class="badge">${esc(listing.placement_label)}</span>` : ''}
    <h3><a href="/properties/${esc(listing.public_slug)}">${esc(listing.property_address || 'Property')}</a></h3>
    <p class="muted" style="margin:0">${esc([listing.city, listing.state].filter(Boolean).join(', '))}</p>
    <p class="price">${esc(money(listing.listing_price))}</p>
    ${details ? `<p class="muted" style="margin:0;font-size:13px">${esc(details)}</p>` : ''}
  </article>`;
}

function shell(opts: { seo: any; breadcrumbs?: any[]; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(opts.seo)}
</head>
<body>
  <header class="band"><div class="wrap"><a class="brand" href="/">Arriv Estate Media</a></div></header>
  <main><div class="wrap">
    ${breadcrumbs(opts.breadcrumbs || [])}
    ${opts.body}
    <p class="disclosure">
      Arriv Estate Media is a real estate media company. Arriv is not the listing brokerage, the seller's agent or your
      buyer's representative. All housing is offered without regard to race, color, religion, sex, disability, familial
      status or national origin. Priority placement is a paid subscription benefit and is not an endorsement or a claim
      about results.
    </p>
  </div></main>
  <footer><div class="wrap">Arriv Estate Media · Public profiles and property pages published with the owner's authorization.</div></footer>
</body>
</html>`;
}

export function renderProfilePage(opts: { profile: any; seo: any; listings: any[]; roster: any[]; contactUrl: string }): string {
  const profile = opts.profile || {};
  const facts: string[] = [];
  if (profile.brokerage_name) facts.push(`${profile.brokerage_name} (affiliation verified)`);
  if (profile.license_number) facts.push(`Licence ${profile.license_number}${profile.license_state ? ` (${profile.license_state})` : ''} · verified`);
  if (profile.contact_phone) facts.push(profile.contact_phone);
  if (profile.city || profile.state) facts.push([profile.city, profile.state].filter(Boolean).join(', '));

  const body = `
    <p class="eyebrow">${profile.profile_type === 'brokerage' ? 'Brokerage' : 'Agent'}</p>
    <h1>${esc(profile.display_name || '')}</h1>
    ${profile.headline ? `<p class="muted" style="margin-top:0">${esc(profile.headline)}</p>` : ''}
    ${facts.length ? `<p class="muted" style="font-size:14px">${facts.map((fact) => esc(fact)).join(' · ')}</p>` : ''}
    <a class="cta" href="${esc(opts.contactUrl)}">Contact ${esc(profile.display_name || 'this professional')}</a>
    ${profile.bio ? `<h2>About</h2><p>${esc(profile.bio)}</p>` : ''}
    ${(profile.service_areas || []).length ? `<h2>Service areas</h2><div class="chips">${profile.service_areas.map((area: string) => `<span class="chip">${esc(area)}</span>`).join('')}</div>` : ''}
    ${opts.roster.length ? `<h2>Agents</h2><div class="grid">${opts.roster.map((agent) => `<article class="card"><h3><a href="${esc(agent.path)}">${esc(agent.display_name)}</a></h3><p class="muted" style="margin:0">${esc(agent.headline || 'Real estate agent')}</p></article>`).join('')}</div>` : ''}
    <h2>Properties</h2>
    ${opts.listings.length
      ? `<div class="grid">${opts.listings.map(listingCard).join('')}</div>`
      : '<p class="muted">No published properties are attached to this profile right now.</p>'}
  `;

  return shell({ seo: opts.seo, breadcrumbs: opts.seo?.breadcrumbs, body });
}

export function renderMarketPage(opts: { market: any; seo: any; listings: any[]; agents: any[] }): string {
  const market = opts.market || {};
  const body = `
    <p class="eyebrow">Local discovery</p>
    <h1>${esc(opts.seo?.title || `Properties in ${market.city || ''}, ${market.state || ''}`)}</h1>
    <p class="muted">${esc(market.listings_count || opts.listings.length)} published ${Number(market.listings_count || opts.listings.length) === 1 ? 'property' : 'properties'}${market.intro ? ` · ${esc(market.intro)}` : ''}</p>
    ${opts.listings.length
      ? `<div class="grid" style="margin-top:20px">${opts.listings.map(listingCard).join('')}</div>`
      : '<p class="muted">No published properties in this area right now.</p>'}
    ${opts.agents.length ? `<h2>Agents in ${esc(market.city || 'this area')}</h2><div class="grid">${opts.agents.map((agent) => `<article class="card"><h3><a href="${esc(agent.path)}">${esc(agent.display_name)}</a></h3><p class="muted" style="margin:0">${esc(agent.brokerage_name || agent.headline || 'Real estate agent')}</p></article>`).join('')}</div>` : ''}
  `;
  return shell({ seo: opts.seo, breadcrumbs: opts.seo?.breadcrumbs, body });
}

export function renderDirectoryPage(opts: { seo: any; profileType: 'agent' | 'brokerage'; profiles: any[] }): string {
  const label = opts.profileType === 'brokerage' ? 'Brokerages' : 'Agents';
  const body = `
    <p class="eyebrow">Arriv Estate Media</p>
    <h1>${esc(label)}</h1>
    <p class="muted">Public profiles of real estate professionals who work with Arriv.</p>
    ${opts.profiles.length
      ? `<div class="grid" style="margin-top:24px">${opts.profiles.map((profile) => `<article class="card">
          ${profile.placement_label ? `<span class="badge">${esc(profile.placement_label)}</span>` : ''}
          <h3><a href="${esc(profile.path)}">${esc(profile.display_name)}</a></h3>
          <p class="muted" style="margin:0">${esc(profile.brokerage_name || profile.headline || '')}</p>
          <p class="muted" style="margin:4px 0 0;font-size:13px">${esc([profile.city, profile.state].filter(Boolean).join(', '))}</p>
        </article>`).join('')}</div>`
      : '<p class="muted">No published profiles yet.</p>'}
  `;
  return shell({ seo: opts.seo, breadcrumbs: opts.seo?.breadcrumbs, body });
}