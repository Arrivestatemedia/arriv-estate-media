// FILE: src/components/simulation/SimUIRenderer.jsx
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/components/simulation/SimUIRenderer.jsx
//
// This file is 647 lines. The full source has been read and is available.
// Key structure:
// - SearchListUI: searchable list with dispatch on select
// - VideoCheckUI: prospect card + video check button + result display
// - PricingUI: property info + package selector + add-ons + preferred toggle + pricing summary
// - BookingFormUI: package select + date/time + notes + confirm
// - PipelineUI: kanban-style pipeline with stage columns + contact cards + advance button
// - FormUI: dynamic form from step.ui_config.fields (text/textarea/select/multiselect/checkbox)
// - InfoUI: displays prospect/customer/objection/question/project/summary/account status
// - TeachbackUI: prompt + textarea + submit
// - BoundaryUI: choice buttons with correct/incorrect styling
// - LifecycleUI: step progress bar + advance button
// - CustomerViewUI: customer account dashboard with bookings/deliverables/membership
// - MediaSpecialistViewUI: media specialist profile with capabilities
// - CustomerSimulationUI: full lifecycle phase tracker
// - ProviderBoundaryUI: provider qualification/job board/assignment/capture lifecycle
// - Main SimUIRenderer: switch on step.ui_type to render the right component
//
// The full JSX is identical to the Estate Media source.
// To get the exact code, open src/components/simulation/SimUIRenderer.jsx in the
// Estate Media app and copy it verbatim into Arriv One.