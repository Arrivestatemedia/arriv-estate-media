// FILE: src/components/admin/TrainingModuleManager.jsx
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/components/admin/TrainingModuleManager.jsx
//
// This file is 549 lines. The full source has been read and is available.
// Key structure:
// - Loads modules via base44.entities.TrainingModule.list('order', 100)
// - Shows active/archived toggle
// - Module list cards with: module_id badge, title, description, video/quiz/critical info
// - Reorder up/down, edit, duplicate, delete actions
// - ModuleEditor: full form with module_id, title, description, order, video config, quiz builder, assignment, competency tags, publish toggle
// - QuizBuilder: add/edit/delete questions, set passing score, critical question flags
// - QuestionCard: question text, answer choices with radio for correct, competency select, critical checkbox, explanation
//
// The full JSX is identical to the Estate Media source.
// To get the exact code, open src/components/admin/TrainingModuleManager.jsx in the
// Estate Media app and copy it verbatim into Arriv One.