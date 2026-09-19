# Arriv One Training Replication — Code Bundles

This directory contains the EXACT source code for every file in the Arriv Estate Media training system. Copy each file's content into the Arriv One builder at the same path. Replace "Estate Media" with "Arriv One" in description strings only.

## Files (copy each into Arriv One at the same path):

### Shared Backend
1. `base44/shared/salesTrainingShared.ts` → see bundle_01_shared_backend.md
2. `base44/shared/certificationContract.ts` → see bundle_02_certification_contract.md

### Frontend Lib
3. `src/lib/certificationRubrics.js` → see bundle_03_rubrics.md
4. `src/lib/simulationEngine.js` → see bundle_04_simulation_engine.md
5. `src/lib/simulationScenarios.js` → see bundle_05_simulation_scenarios.md

### Backend Function
6. `base44/functions/manageCertificationAuthorization/entry.ts` → see bundle_06_cert_api.md

### Simulation Components
7. `src/components/simulation/SimulationContext.jsx` → see bundle_07_sim_context.md
8. `src/components/simulation/SimulationBanner.jsx` → see bundle_08_sim_banner.md
9. `src/components/simulation/ScenarioRunner.jsx` → see bundle_09_scenario_runner.md
10. `src/components/simulation/SimUIRenderer.jsx` → see bundle_10_sim_ui_renderer.md
11. `src/components/simulation/ManagerReview.jsx` → see bundle_11_manager_review.md
12. `src/components/simulation/ReadinessChecklist.jsx` → see bundle_12_readiness.md
13. `src/components/simulation/PracticalScoreModal.jsx` → see bundle_13_practical_modal.md
14. `src/components/simulation/DomainStatusGrid.jsx` → see bundle_14_domain_grid.md

### Training Components
15. `src/components/sales/SalesTrainingContent.jsx` → see bundle_15_training_content.md
16. `src/components/admin/TrainingModuleManager.jsx` → see bundle_16_module_manager.md

### Pages
17. `src/pages/SalesTrainingPortal.jsx` → see bundle_17_training_portal.md
18. `src/pages/SalesTrainingAdmin.jsx` → see bundle_18_training_admin.md
19. `src/pages/TrainingSimulation.jsx` → see bundle_19_simulation_page.md

## How to use:
1. Open each bundle file in this directory
2. Copy its full content
3. Paste into the Arriv One builder, creating the file at the path shown in the bundle header
4. Replace "Estate Media" → "Arriv One" in description strings only
5. Do NOT change any logic, field names, enum values, or styling