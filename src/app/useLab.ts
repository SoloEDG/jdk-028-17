import { ref } from "vue";
import type { Notice } from "@/shared/commands";
import type { LabMode, Point } from "@/shared/types";
import { usePlacement } from "@/features/catalog";
import { topologicalOrder, useCircuit } from "@/features/circuit";
import { useSimulation } from "@/features/simulation";
import { useChallenge } from "@/features/challenge";
import { latchCircuit, loadInitial, useWorkspace } from "@/features/workspace";
export function useLab() {
  const initial = loadInitial(),
    document = ref(initial.document);
  const notice = ref<Notice>({
    tone: initial.warning ? "error" : "info",
    message: initial.warning ?? "示例已就绪。切换输入，观察信号如何到达输出。",
  });
  const notify = (next: Notice) => {
    notice.value = next;
  };
  const placement = usePlacement();
  const circuit = useCircuit(document, notify);
  const simulation = useSimulation(document),
    challenge = useChallenge(document);
  const workspace = useWorkspace(document, notify, () => {
    circuit.resetSelection();
    challenge.reset();
    placement.tool.value = null;
  });
  function place(point: Point) {
    if (!placement.tool.value) return;
    if (document.value.nodes.length >= 120) {
      notify({
        tone: "error",
        message: "最多支持 120 个元件，请先删除不用的元件",
      });
      return;
    }
    const node = placement.createNode(
      document.value,
      placement.tool.value,
      point,
    );
    document.value.nodes.push(node);
    circuit.selected.value = node.id;
    placement.tool.value = null;
    notify({
      tone: "success",
      message: `已放置 ${node.label}，点击端口开始连线`,
    });
  }
  function move(id: string, point: Point) {
    const node = document.value.nodes.find((n) => n.id === id);
    if (node) {
      node.x = point.x;
      node.y = point.y;
    }
  }
  function cancel() {
    circuit.pending.value = null;
    placement.tool.value = null;
    notify({ tone: "info", message: "已取消当前放置或连线" });
  }
  function renameNode(label: string) {
    const node = document.value.nodes.find(
      (n) => n.id === circuit.selected.value,
    );
    if (node) node.label = label.trim().slice(0, 40) || node.kind;
  }
  function setMode(next: LabMode) {
    const current = document.value.mode ?? "combinational";
    if (next === current) return;
    document.value.mode = next;
    if (next === "research") {
      notify({
        tone: "info",
        message: "反馈研究模式：允许反馈连线，自动枚举全部稳定状态",
      });
      return;
    }
    try {
      topologicalOrder(document.value);
      notify({ tone: "info", message: "已切回组合模式" });
    } catch {
      notify({
        tone: "error",
        message:
          "已切回组合模式：电路仍含反馈环，相关信号显示为 X；请删除环路或切回研究模式",
      });
    }
  }
  function togglePin(id: string) {
    const node = document.value.nodes.find((n) => n.id === id);
    if (!node || node.kind === "INPUT") return;
    const pins = (document.value.pins ??= {}),
      current = pins[id];
    if (current === undefined) {
      pins[id] = 0;
      notify({
        tone: "info",
        message: `已钉住 ${node.label} = 0，仅显示符合的稳定状态`,
      });
    } else if (current === 0) {
      pins[id] = 1;
      notify({ tone: "info", message: `已钉住 ${node.label} = 1` });
    } else {
      delete pins[id];
      if (!Object.keys(pins).length) delete document.value.pins;
      notify({ tone: "info", message: `已松开 ${node.label}` });
    }
  }
  function unpin(id: string) {
    if (!document.value.pins || !(id in document.value.pins)) return;
    delete document.value.pins[id];
    if (!Object.keys(document.value.pins).length) delete document.value.pins;
  }
  function clearPins() {
    if (!document.value.pins) return;
    delete document.value.pins;
    notify({ tone: "info", message: "已清除全部钉住条件" });
  }
  function loadLatchSample() {
    workspace.load(
      latchCircuit(),
      "已载入 SR 锁存器示例：切换 S、R，观察稳定状态数量变化",
    );
  }
  return {
    document,
    notice,
    notify,
    placement,
    circuit,
    simulation,
    challenge,
    workspace,
    place,
    move,
    cancel,
    renameNode,
    setMode,
    togglePin,
    unpin,
    clearPins,
    loadLatchSample,
  };
}
