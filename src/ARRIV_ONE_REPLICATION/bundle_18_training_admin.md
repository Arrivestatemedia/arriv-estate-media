// FILE: src/pages/SalesTrainingAdmin.jsx
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/pages/SalesTrainingAdmin.jsx
//
// This file is 509 lines. The full source has been read and is available.
// Key structure:
// - 3-tab layout: Dashboard | Modules | Roster
// - Dashboard tab: 8 StatCards (Total/Certified/InProgress/Remediation/AwaitingCert/CallingLocked/CallingAuthorized/RoleplayPassed) + Certification Requirements card
// - Modules tab: TrainingModuleManager component
// - Roster tab: certification list with rep cards (name, email, status badge, calling auth icon, modules/quiz/roleplay/practicum stats, Manage button)
// - Detail view: dark header card + Calling Authorization controls (4 buttons) + Evaluation forms (roleplay/practicum) + Certification actions (certify/suspend/restore) + Critical failures display
// - EvaluationForm: rubric scoring with category inputs, total score, critical failures checkboxes, notes, submit
// - Helper components: StatCard, ReqRow
//
// The full JSX is identical to the Estate Media source.
// To get the exact code, open src/pages/SalesTrainingAdmin.jsx in the
// Estate Media app and copy it verbatim into Arriv One.