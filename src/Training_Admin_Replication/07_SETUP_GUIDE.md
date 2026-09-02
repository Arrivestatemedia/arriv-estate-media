# Training Admin System — Setup Guide & Routing

## File Structure

```
base44/
  entities/
    TrainingModule.jsonc
    SalesCertification.jsonc
    TrainingAttempt.jsonc
    VideoWatchProgress.jsonc
    AuditEvent.jsonc
  shared/
    salesTrainingShared.ts
  functions/
    saveTrainingModule/entry.ts
    recordTrainingModuleScore/entry.ts
    getSalesTrainingVideos/entry.ts
    setSalesTrainingVideos/entry.ts
src/
  Layout.jsx                          ← app shell (header, nav, mobile menu, bottom tabs, theme)
  utils/
    index.ts                          ← createPageUrl helper
  lib/
    salesTrainingData.js
  pages/
    SalesTrainingAdmin.jsx
    SalesTrainingPortal.jsx
  components/
    admin/TrainingModuleManager.jsx
    sales/SalesTrainingContent.jsx
    layout/
      MobileBottomTabs.jsx
      PageTransition.jsx
```

> **Layout files** are in `08_LAYOUT.md` — the app shell with the dark header, role-based nav, mobile menu, bottom tabs, page transitions, and the Arriv brand theme (Cream/Gold/Black).

---

## Replication Files

1. `01_ENTITIES.md` — 5 entity schemas with RLS notes
2. `02_SHARED_BACKEND.md` — `salesTrainingShared.ts` + 4 backend functions
3. `03_FRONTEND_CONSTANTS.md` — `salesTrainingData.js` constants
4. `04_ADMIN_PAGE.md` — `SalesTrainingAdmin.jsx` (dashboard, modules, roster, evaluations)
5. `05_MODULE_MANAGER.md` — `TrainingModuleManager.jsx` (CRUD + quiz builder)
6. `06_REP_PORTAL.md` — `SalesTrainingPortal.jsx` + `SalesTrainingContent.jsx`
7. `07_SETUP_GUIDE.md` — this file
8. `08_LAYOUT.md` — `Layout.jsx`, `MobileBottomTabs.jsx`, `PageTransition.jsx`, theme variables

---

## Routing

Add these routes to your `src/App.jsx`:

```jsx
import SalesTrainingAdmin from './pages/SalesTrainingAdmin';
import SalesTrainingPortal from './pages/SalesTrainingPortal';
import Layout from './Layout';

const LayoutWrapper = ({ children, currentPageName }) => (
  <Layout currentPageName={currentPageName}>{children}</Layout>
);

// Inside <Routes>:
<Route
  path="/SalesTrainingAdmin"
  element={
    <LayoutWrapper currentPageName="SalesTrainingAdmin">
      <SalesTrainingAdmin />
    </LayoutWrapper>
  }
/>
<Route
  path="/SalesTrainingPortal"
  element={
    <LayoutWrapper currentPageName="SalesTrainingPortal">
      <SalesTrainingPortal />
    </LayoutWrapper>
  }
/>
```

---

## Setup Checklist

1. **Create the 5 entities** (TrainingModule, SalesCertification, TrainingAttempt, VideoWatchProgress, AuditEvent) — paste the JSON schemas from `01_ENTITIES.md` into `base44/entities/<Name>.jsonc`.

2. **Create the shared constants file** `base44/shared/salesTrainingShared.ts` — paste the TypeScript code from `02_SHARED_BACKEND.md`.

3. **Create the 4 backend functions** — create folders under `base44/functions/<name>/entry.ts` and paste the code from `02_SHARED_BACKEND.md`. The `saveTrainingModule` and `recordTrainingModuleScore` functions depend on `orientationEngine.ts` — if you don't have that file, either:
   - Remove the `writeOrientationAudit` call from `saveTrainingModule` (it's just audit logging)
   - Simplify `recordTrainingModuleScore` to directly create a `TrainingAttempt` and update `SalesCertification` instead of using the orientation engine

4. **Create the frontend constants** `src/lib/salesTrainingData.js` — paste the JavaScript code from `03_FRONTEND_CONSTANTS.md`.

5. **Create the layout files** — `src/Layout.jsx`, `src/components/layout/MobileBottomTabs.jsx`, `src/components/layout/PageTransition.jsx`, and the `createPageUrl` helper in `src/utils/index.ts` — all from `08_LAYOUT.md`. Customize the nav item arrays in Layout.jsx and MobileBottomTabs.jsx to match your target app's pages.

6. **Create the admin page** `src/pages/SalesTrainingAdmin.jsx` (from `04_ADMIN_PAGE.md`) and the module manager `src/components/admin/TrainingModuleManager.jsx` (from `05_MODULE_MANAGER.md`).

7. **Create the rep portal** `src/pages/SalesTrainingPortal.jsx` and the content component `src/components/sales/SalesTrainingContent.jsx` (from `06_REP_PORTAL.md`).

8. **Add routes** to `src/App.jsx` (see Routing above).

9. **Adjust RLS** — review the RLS notes on TrainingModule and AuditEvent in `01_ENTITIES.md`. The rep portal needs to read modules and create audit events; the admin page needs full CRUD on everything.

10. **Adjust `sales_member_id` source** — the rep portal reads the member ID from `localStorage`/`sessionStorage`. If your target app uses Base44 auth instead of a custom sales login, replace `getSalesMemberId()` with `base44.auth.me()` and use `user.id`.

11. **Seed modules** — after creating the entities, use the admin page's "Add Module" button to create your training modules, or seed them via `create_entity_records`.

---

## Key Design Decisions

- **95% passing threshold** everywhere — module quizzes, final exam, role-play, practicum, and video watch completion all require 95%.
- **Critical questions override score** — a rep can score 96% but still fail if any critical question is wrong.
- **Critical failures override score** — a rep can score 96/100 on role-play but still fail if any critical failure is flagged.
- **Sequential module unlocking** — module N+1 is locked until module N's video is watched (≥95%) AND quiz is passed.
- **Seek detection** — the video player tracks watched segments and calculates unique watched time. Seeking to the end without watching does not count.
- **Calling authorization is separate from certification** — admins can grant supervised or training-independent calling before full certification.
- **Full audit trail** — every quiz, evaluation, certification, suspension, and calling auth change creates an AuditEvent.
- **Dark header + cream body** — the header is always dark (`#1A1A1A`) with gold accents; the page body uses cream (`#FFFBF5`) in light mode and near-black (`#0A0A0A`) in dark mode.

---

## Dependencies on Other Systems

The Training Admin system has a few dependencies on other parts of the source app that you may need to adapt:

1. **`SalesTeamMember` entity** — `SalesCertification` references `sales_member_id` which is a `SalesTeamMember` ID. If your target app doesn't have this entity, replace with `User` ID or your own member identifier.

2. **`AppSetting` entity** — used by `getSalesTrainingVideos`/`setSalesTrainingVideos` to store optional extra training videos. If you don't have this entity, skip those two functions.

3. **`orientationEngine.ts`** — the shared backend module that `saveTrainingModule` and `recordTrainingModuleScore` depend on. It provides `writeOrientationAudit`, `getOrientationBundle`, `getActiveTrainingModules`, and `recordTrainingScore`. If you don't have the orientation system, see the simplification notes in step 3 above.

4. **Custom sales auth** — the rep portal reads `sales_member_id` from localStorage. If your app uses Base44's built-in auth, replace the `getSalesMemberId()` helper with `base44.auth.me()` and use the returned user's `id`. The Layout.jsx also reads from localStorage — adjust the user-detection logic to match your auth scheme.

5. **shadcn/ui components** — the admin page and module manager use `Button`, `Card`, `Badge`, `Input`, `Textarea`, `Label`, `Select`, `Tabs` from `@/components/ui/`. These are standard shadcn/ui components available in any Base44 app.

6. **lucide-react icons** — all icons used are from `lucide-react`, which is pre-installed in Base44 apps.

7. **framer-motion** — `PageTransition.jsx` uses framer-motion for page transitions. It's pre-installed in Base44 apps. If you don't want page transitions, remove the `<PageTransition>` wrapper from Layout.jsx.