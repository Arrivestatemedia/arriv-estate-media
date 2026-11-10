# Phase 4 — Single Activation Checklist

Everything below is an action **you** take. Nothing here is done, and no switch moves without you.

---

## A. Nothing is live yet (verify first)

All activation switches are unset, which the code reads as OFF:

| Switch | Key | State | What stays impossible while off |
|---|---|---|---|
| Subscription checkout | `visibility_subscription_checkout` | OFF | No plan can be purchased |
| Profile publication | `visibility_profile_publication` | OFF | No profile becomes public |
| Geographic publication | `visibility_geo_publication` | OFF | No city page becomes public/indexable |
| Subscription emails | `visibility_customer_notifications` | OFF | No subscription email is sent |
| Package checkout (Phase 2) | `PROPERTY_PACKAGE_CHECKOUT_ENABLED` | OFF | No Plus/Pro purchase |
| Advertising checkout (Phase 3) | `property_ads_customer_checkout` | OFF | No campaign purchase |
| Meta connection / auto-publish / budget (Phase 3) | `property_ads_*` | OFF | No request leaves for Meta |

Confirm the current state on **Administration → Launch Readiness**.

---

## B. Configuration (no approval needed, reversible)

1. **Brevo** — confirm the sending address used for bookings (`bookings@arrivestatemedia.com`) is an
   active, verified sender.
2. **Stripe prices** — create three recurring monthly prices: $49, $99, $249. Paste the `price_…` ids
   into **Visibility & SEO → Plans**.
3. **Stripe webhook** — confirm the endpoint receives `customer.subscription.created`,
   `.updated`, `.deleted`, `invoice.paid`, `invoice.payment_failed` alongside the existing events.
4. **Cloudflare Worker** — apply the patch in `edge/property-edge/PHASE4_WORKER_ROUTES.md` and deploy.

---

## C. Order of activation (one at a time, verifying after each)

1. Turn on **profile publication**, publish one real agent profile (owner authorizes → you approve →
   publish), load the public URL, confirm canonical + robots and that no private data appears.
2. Send one real inquiry from that profile. Confirm the record exists and the notification arrived.
3. Turn on **geographic publication**, create one market that genuinely has ≥3 published properties,
   publish it, confirm the page renders and appears in `sitemap.xml`.
4. Turn on **subscription checkout**, complete one Stripe test-mode subscription, confirm the record
   becomes `active`, billing history shows the invoice, cancellation keeps benefits to period end, and the
   period expires correctly.
5. Turn on **subscription emails** only after step 4's emails arrive in a controlled inbox.
6. Phase 2 and Phase 3 activation remain your separate decisions; this phase changed neither.

---

## D. External approvals and verification outstanding

- Cloudflare Worker deployment (prepared, not deployed).
- Stripe price creation and one verified subscription lifecycle.
- Brevo sender verification and one verified delivery.
- Search Console submission after the Worker is live.
- Meta advertising credentials — not required for Phase 4; manual fulfilment remains the supported path.

---

## E. What is already true in code

- 134 Phase 4 checks and all Phase 1–3 suites pass, with no real charge, email or publication.
- No public page can render for an unauthorized, unapproved or unpublished profile.
- No market page can be indexed without the property threshold, approval and the switch.
- No customer is charged by deploying code; only the checkout switch plus a Stripe price can do that.