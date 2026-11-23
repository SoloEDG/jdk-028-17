import type {
  CircuitDocument,
  GateNode,
  Signal,
  SimulationResult,
  Wire,
} from "@/shared/types";
import { getSpec } from "@/features/catalog";
import { gateValue } from "./logic";

export const MAX_FEEDBACK_NODES = 12;
export const MAX_STATES = 200;
export const MAX_INPUT_SCAN = 6;

export interface StableState {
  values: Record<string, Signal>;
  satisfied: Record<string, boolean>;
}
export interface StabilityAnalysis {
  status: "unique" | "multiple" | "none";
  states: StableState[];
  truncated: boolean;
  /** true = 仅当前输入下唯一稳定；null = 输入过多未全量核对 */
  inputDependent: boolean | null;
  feedbackNodes: string[];
  feedbackWires: string[];
  conflictNodes: string[];
  conflictWires: string[];
  pinsCausedConflict: boolean;
  error: string | null;
}

interface Layers {
  nodes: Map<string, GateNode>;
  incoming: Map<string, Wire[]>;
  components: string[][];
  compOf: Map<string, number>;
  cyclic: boolean[];
  order: number[];
}

function tarjan(ids: string[], outgoing: Map<string, string[]>): string[][] {
  const index = new Map<string, number>(),
    low = new Map<string, number>(),
    onStack = new Set<string>(),
    stack: string[] = [],
    result: string[][] = [];
  let counter = 0;
  function visit(v: string) {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of outgoing.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w))
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w = "";
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      result.push(comp);
    }
  }
  for (const id of ids) if (!index.has(id)) visit(id);
  return result;
}

function buildLayers(document: CircuitDocument): Layers {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>(),
    incoming = new Map<string, Wire[]>();
  for (const node of document.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const wire of document.wires) {
    if (!outgoing.has(wire.from.nodeId) || !incoming.has(wire.to.nodeId))
      continue;
    outgoing.get(wire.from.nodeId)!.push(wire.to.nodeId);
    incoming.get(wire.to.nodeId)!.push(wire);
  }
  const components = tarjan(
    document.nodes.map((node) => node.id),
    outgoing,
  );
  const compOf = new Map<string, number>();
  components.forEach((comp, index) =>
    comp.forEach((id) => compOf.set(id, index)),
  );
  const cyclic = components.map((comp) => comp.length > 1);
  const degree = components.map(() => 0),
    adjacent = new Map<number, Set<number>>();
  for (const wire of document.wires) {
    const from = compOf.get(wire.from.nodeId),
      to = compOf.get(wire.to.nodeId);
    if (from === undefined || to === undefined || from === to) continue;
    if (!adjacent.has(from)) adjacent.set(from, new Set());
    if (!adjacent.get(from)!.has(to)) {
      adjacent.get(from)!.add(to);
      degree[to]++;
    }
  }
  const order: number[] = [],
    queue = components.map((_, index) => index).filter((i) => degree[i] === 0);
  for (let i = 0; i < queue.length; i++) {
    order.push(queue[i]);
    for (const next of adjacent.get(queue[i]) ?? []) {
      degree[next]--;
      if (degree[next] === 0) queue.push(next);
    }
  }
  return { nodes, incoming, components, compOf, cyclic, order };
}

function nodeValue(
  layers: Layers,
  id: string,
  values: Record<string, Signal>,
  overrides: Record<string, 0 | 1>,
): Signal {
  const node = layers.nodes.get(id)!;
  if (node.kind === "INPUT")
    return Object.hasOwn(overrides, id) ? overrides[id] : node.value;
  const spec = getSpec(node.kind),
    pins: Signal[] = [];
  for (let port = 0; port < spec.inputs; port++) {
    const wire = layers.incoming
      .get(id)!
      .find((w) => w.to.port === port);
    pins.push(wire ? (values[wire.from.nodeId] ?? "X") : "X");
  }
  return gateValue(node.kind, pins);
}

interface Enumeration {
  states: Record<string, Signal>[];
  reached: boolean[];
  solvable: boolean[];
}

/**
 * 沿凝聚图拓扑序 DFS：无环节点直接求值，反馈环整体枚举 0/1 赋值并
 * 校验局部一致性。跨环状态以联合赋值向下传递，因此保留环与环之间
 * 的相关性，而不是各自独立的可能值。
 */
function enumerate(
  layers: Layers,
  overrides: Record<string, 0 | 1>,
  pins: Record<string, 0 | 1>,
  limit: number,
): Enumeration {
  const { components, cyclic, order } = layers;
  const states: Record<string, Signal>[] = [],
    reached = components.map(() => false),
    solvable = components.map(() => false),
    values: Record<string, Signal> = Object.create(null);
  let stopped = false;
  function pinOf(id: string): 0 | 1 | undefined {
    return layers.nodes.get(id)!.kind === "INPUT" ? undefined : pins[id];
  }
  function dfs(depth: number): void {
    if (stopped) return;
    if (depth >= order.length) {
      states.push({ ...values });
      if (states.length >= limit) stopped = true;
      return;
    }
    const ci = order[depth],
      comp = components[ci];
    if (!cyclic[ci]) {
      const id = comp[0],
        value = nodeValue(layers, id, values, overrides),
        pin = pinOf(id);
      if (pin === undefined || pin === value) {
        values[id] = value;
        dfs(depth + 1);
        delete values[id];
      }
      return;
    }
    reached[ci] = true;
    const total = 1 << comp.length;
    for (let mask = 0; mask < total && !stopped; mask++) {
      let blocked = false;
      for (let i = 0; i < comp.length; i++) {
        const bit = ((mask >> i) & 1) as 0 | 1,
          pin = pinOf(comp[i]);
        if (pin !== undefined && pin !== bit) {
          blocked = true;
          break;
        }
        values[comp[i]] = bit;
      }
      if (!blocked) {
        let consistent = true;
        for (const id of comp)
          if (nodeValue(layers, id, values, overrides) !== values[id]) {
            consistent = false;
            break;
          }
        if (consistent) {
          solvable[ci] = true;
          dfs(depth + 1);
        }
      }
      for (const id of comp) delete values[id];
    }
  }
  dfs(0);
  return { states, reached, solvable };
}

function verify(
  layers: Layers,
  values: Record<string, Signal>,
  overrides: Record<string, 0 | 1>,
): Record<string, boolean> {
  const satisfied: Record<string, boolean> = Object.create(null);
  for (const [id, node] of layers.nodes)
    satisfied[id] =
      node.kind === "INPUT"
        ? true
        : nodeValue(layers, id, values, overrides) === values[id];
  return satisfied;
}

export function analyzeStability(
  document: CircuitDocument,
  overrides: Record<string, 0 | 1> = {},
  pins: Record<string, 0 | 1> = {},
  options: { scanInputs?: boolean } = {},
): StabilityAnalysis {
  const layers = buildLayers(document);
  const feedbackNodes = layers.components
      .filter((_, index) => layers.cyclic[index])
      .flat(),
    inLoop = new Set(feedbackNodes);
  const feedbackWires = document.wires
    .filter(
      (wire) =>
        inLoop.has(wire.from.nodeId) &&
        layers.compOf.get(wire.from.nodeId) === layers.compOf.get(wire.to.nodeId),
    )
    .map((wire) => wire.id);
  const analysis: StabilityAnalysis = {
    status: "none",
    states: [],
    truncated: false,
    inputDependent: null,
    feedbackNodes,
    feedbackWires,
    conflictNodes: [],
    conflictWires: [],
    pinsCausedConflict: false,
    error: null,
  };
  if (
    layers.components.some(
      (comp, index) => layers.cyclic[index] && comp.length > MAX_FEEDBACK_NODES,
    )
  ) {
    analysis.error = `反馈环超过 ${MAX_FEEDBACK_NODES} 个元件，无法完整枚举稳定状态；请拆分或简化环路`;
    return analysis;
  }
  const found = enumerate(layers, overrides, pins, MAX_STATES + 1);
  const truncated = found.states.length > MAX_STATES,
    raw = found.states.slice(0, MAX_STATES);
  analysis.truncated = truncated;
  analysis.status =
    raw.length === 0 ? "none" : raw.length === 1 && !truncated ? "unique" : "multiple";
  analysis.states = raw.map((values) => ({
    values,
    satisfied: verify(layers, values, overrides),
  }));
  if (analysis.status === "unique" && options.scanInputs !== false) {
    const inputs = document.nodes.filter((node) => node.kind === "INPUT");
    if (inputs.length <= MAX_INPUT_SCAN) {
      analysis.inputDependent = false;
      for (let mask = 0; mask < 1 << inputs.length; mask++) {
        const scan: Record<string, 0 | 1> = {};
        inputs.forEach((node, bit) => {
          scan[node.id] = ((mask >> bit) & 1) as 0 | 1;
        });
        if (enumerate(layers, scan, pins, 2).states.length !== 1) {
          analysis.inputDependent = true;
          break;
        }
      }
    }
  }
  if (analysis.status === "none") {
    const failed = layers.components.filter(
        (_, index) =>
          layers.cyclic[index] && found.reached[index] && !found.solvable[index],
      ),
      reachedLoops = layers.components.filter(
        (_, index) => layers.cyclic[index] && found.reached[index],
      );
    const targets = failed.length
      ? failed
      : reachedLoops.length
        ? reachedLoops
        : layers.components.filter((_, index) => layers.cyclic[index]);
    analysis.conflictNodes = targets.flat();
    const conflict = new Set(analysis.conflictNodes);
    analysis.conflictWires = document.wires
      .filter(
        (wire) => conflict.has(wire.from.nodeId) && conflict.has(wire.to.nodeId),
      )
      .map((wire) => wire.id);
    if (Object.keys(pins).length)
      analysis.pinsCausedConflict =
        enumerate(layers, overrides, {}, 1).states.length > 0;
  }
  return analysis;
}

/** 无稳定状态时的画布取值：无环部分照常求值，反馈环节点标 X。 */
export function partialEvaluate(
  document: CircuitDocument,
  overrides: Record<string, 0 | 1> = {},
): Record<string, Signal> {
  const layers = buildLayers(document),
    values: Record<string, Signal> = Object.create(null);
  for (const ci of layers.order) {
    const comp = layers.components[ci];
    if (layers.cyclic[ci]) for (const id of comp) values[id] = "X";
    else values[comp[0]] = nodeValue(layers, comp[0], values, overrides);
  }
  return values;
}

export function toSimulationResult(
  document: CircuitDocument,
  values: Record<string, Signal>,
): SimulationResult {
  const full: Record<string, Signal> = Object.create(null),
    pins: Record<string, Signal[]> = Object.create(null),
    wires: Record<string, Signal> = Object.create(null);
  for (const node of document.nodes) full[node.id] = values[node.id] ?? "X";
  for (const node of document.nodes)
    pins[node.id] = Array.from(
      { length: getSpec(node.kind).inputs },
      (_, port) => {
        const wire = document.wires.find(
          (w) => w.to.nodeId === node.id && w.to.port === port,
        );
        return wire ? (full[wire.from.nodeId] ?? "X") : "X";
      },
    );
  for (const wire of document.wires)
    wires[wire.id] = full[wire.from.nodeId] ?? "X";
  return { values: full, pins, wires, order: [] };
}
