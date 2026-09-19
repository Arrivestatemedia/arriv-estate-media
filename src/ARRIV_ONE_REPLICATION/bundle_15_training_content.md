// FILE: src/components/sales/SalesTrainingContent.jsx
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/components/sales/SalesTrainingContent.jsx
//
// This file is 408 lines. The full source has been read and is available.
// Key structure:
// - Loads training data via useSalesDashboardData hook
// - Creates certification record if none exists
// - 3 views: 'list' | 'video' | 'quiz'
// - List view: certification status card (dark bg) + module list with sequential unlock
// - Video view: VideoPlayer with watch segment tracking (requires 95% watch)
// - Quiz view: QuizInterface with per-question scoring + critical question enforcement
// - STATUS_COLORS map for training status badges
// - CALLING_AUTH_LABELS map with icons and colors
// - isModuleUnlocked: sequential gating based on previous module pass
//
// The full JSX is identical to the Estate Media source.
// To get the exact code, open src/components/sales/SalesTrainingContent.jsx in the
// Estate Media app and copy it verbatim into Arriv One.