// FILE: src/components/simulation/SimulationContext.jsx
// Copy this entire file into Arriv One at the same path.

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { simulationReducer, validateAction, sanitizeInput, generateSessionId, generateEventId } from "@/lib/simulationEngine";
import { getScenarioById, SIMULATION_LEVELS } from "@/lib/simulationScenarios";

const SimulationContext = createContext(null);

export function SimulationProvider({ children }) {
  const [sessionId] = useState(() => generateSessionId());
  const [currentScenarioId, setCurrentScenarioId] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);
  const [simState, setSimState] = useState(null);
  const [events, setEvents] = useState([]);
  const [lastValidation, setLastValidation] = useState(null);
  const [isLogging, setIsLogging] = useState(false);
  const eventCounter = useRef(0);

  const learner = {
    id: localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id"),
    email: localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email"),
    name: localStorage.getItem("sales_member_name") || sessionStorage.getItem("sales_member_name"),
  };

  const currentScenario = currentScenarioId ? getScenarioById(currentScenarioId) : null;
  const stepIndex = simState?.step_index || 0;
  const currentStep = currentScenario?.steps?.[stepIndex];
  const isComplete = simState?.completed || false;

  const startScenario = useCallback((scenarioId, level) => {
    const scenario = getScenarioById(scenarioId);
    if (!scenario) return;
    setCurrentScenarioId(scenarioId);
    setCurrentLevel(level || scenario.level);
    setSimState({ ...scenario.initial_state, step_index: 0, completed: false });
    setEvents([]);
    setLastValidation(null);
  }, []);

  const resetScenario = useCallback(() => {
    if (!currentScenario) return;
    setSimState({ ...currentScenario.initial_state, step_index: 0, completed: false });
    setEvents([]);
    setLastValidation(null);
  }, [currentScenario]);

  const dispatch = useCallback(async (action, input = {}) => {
    if (!currentScenario || !simState) return null;

    const beforeState = JSON.parse(JSON.stringify(simState));
    const startTime = Date.now();

    const newState = simulationReducer(simState, action, input, currentScenario);
    setSimState(newState);

    const validation = validateAction(currentScenario, stepIndex, action, input, newState);
    setLastValidation(validation);

    const afterState = JSON.parse(JSON.stringify(newState));
    const latency = Date.now() - startTime;

    const eventId = generateEventId(sessionId);
    const event = {
      event_id: eventId, learner_id: learner.id, learner_email: learner.email, learner_name: learner.name,
      session_id: sessionId, scenario_id: currentScenario.id, scenario_version: currentScenario.version,
      level: currentLevel || currentScenario.level, role: currentScenario.role,
      screen: currentStep?.screen, action, input_metadata: sanitizeInput(input),
      before_state: beforeState, after_state: afterState,
      expected_category: validation.expected_category, validation_result: validation.result,
      validation_notes: validation.notes, criticality: validation.criticality,
      timestamp: new Date().toISOString(), latency_ms: latency,
    };

    setEvents(prev => [...prev, event]);

    setIsLogging(true);
    try {
      await base44.entities.TrainingSimulationEvent.create(event);
    } catch (e) {
      console.error("[Simulation] Failed to persist event:", e);
    } finally {
      setIsLogging(false);
    }

    if (validation.result === "correct" && !newState.boundary_violation && !newState.critical_failure) {
      if (stepIndex + 1 < currentScenario.steps.length) {
        const advancedState = simulationReducer(newState, "advance_step", {}, currentScenario);
        setSimState(advancedState);
      } else {
        setSimState({ ...newState, completed: true });
      }
    }

    return validation;
  }, [currentScenario, simState, stepIndex, currentStep, currentLevel, learner, sessionId]);

  const value = {
    sessionId, learner, currentScenario, currentLevel, currentStep, stepIndex,
    simState, events, lastValidation, isLogging, isComplete,
    isSimulation: true, startScenario, resetScenario, dispatch, setCurrentLevel,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error("useSimulation must be used within SimulationProvider");
  return ctx;
}