import { computed, ref, watch, type Ref } from "vue";
import type { CircuitDocument, Signal, SimulationResult } from "@/shared/types";
import { getSpec } from "@/features/catalog";
import { evaluate } from "../lib/evaluate";
import {
  analyzeStability,
  partialEvaluate,
  toSimulationResult,
} from "../lib/stability";
export function useSimulation(document: Ref<CircuitDocument>) {
  const stateIndex = ref(0);
  const mode = computed(() => document.value.mode ?? "combinational");
  const analysis = computed(() =>
    mode.value === "research"
      ? analyzeStability(document.value, {}, document.value.pins ?? {})
      : null,
  );
  const currentState = computed(() => {
    const result = analysis.value;
    if (!result || !result.states.length) return null;
    return result.states[Math.min(stateIndex.value, result.states.length - 1)];
  });
  watch([mode, () => analysis.value?.states.length ?? 0], () => {
    if (stateIndex.value >= (analysis.value?.states.length ?? 0))
      stateIndex.value = 0;
  });
  const combinational = computed(() => {
    try {
      return { result: evaluate(document.value), error: null as string | null };
    } catch (error) {
      return {
        result: fallbackResult(document.value),
        error: error instanceof Error ? error.message : "电路无法仿真",
      };
    }
  });
  const signals = computed<SimulationResult>(() => {
    if (mode.value !== "research") return combinational.value.result;
    return toSimulationResult(
      document.value,
      currentState.value?.values ?? partialEvaluate(document.value),
    );
  });
  const simulationError = computed(() =>
    mode.value === "research"
      ? (analysis.value?.error ?? null)
      : combinational.value.error,
  );
  function showState(index: number) {
    const count = analysis.value?.states.length ?? 0;
    stateIndex.value = count ? ((index % count) + count) % count : 0;
  }
  function toggle(id: string) {
    const node = document.value.nodes.find((n) => n.id === id);
    if (node?.kind === "INPUT") node.value = node.value === 0 ? 1 : 0;
  }
  return {
    signals,
    toggle,
    mode,
    analysis,
    currentState,
    stateIndex,
    showState,
    simulationError,
  };
}
function fallbackResult(document: CircuitDocument): SimulationResult {
  const values: Record<string, Signal> = Object.create(null),
    pins: Record<string, Signal[]> = Object.create(null),
    wires: Record<string, Signal> = Object.create(null);
  for (const node of document.nodes) {
    values[node.id] = "X";
    pins[node.id] = Array.from(
      { length: getSpec(node.kind).inputs },
      (): Signal => "X",
    );
  }
  for (const wire of document.wires) wires[wire.id] = "X";
  return { values, pins, wires, order: [] };
}
