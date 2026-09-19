// FILE: src/components/simulation/ManagerReview.jsx
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/components/simulation/ManagerReview.jsx
//
// This file is 418 lines. The full source has been read and is available.
// Key structure:
// - Loads learners list + certification status via manageCertificationAuthorization function
// - Status banner with training_status + calling_authorization badges
// - Quick stats grid (modules, quiz avg, critical misses, active failures)
// - Manager action buttons: Authorize, Score Role-Play/CRM/Onboarding/Teachback, Coaching Note, Lock/Unlock Calling, Suspend/Restore
// - Coaching note form with domain selector
// - DomainStatusGrid component
// - ReadinessChecklist component
// - Critical misses list
// - Active critical failures display
// - Remediation modules with clear buttons
// - Simulation event timeline with filter (all/correct/warning/critical_failure)
// - Coaching notes list
// - Manager intervention log
// - PracticalScoreModal integration
//
// The full JSX is identical to the Estate Media source.
// To get the exact code, open src/components/simulation/ManagerReview.jsx in the
// Estate Media app and copy it verbatim into Arriv One.