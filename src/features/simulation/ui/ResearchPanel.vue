<script setup lang="ts">
import { computed } from "vue";
import type { CircuitDocument } from "@/shared/types";
import type { StabilityAnalysis } from "../lib/stability";
const props = defineProps<{
  document: CircuitDocument;
  analysis: StabilityAnalysis;
  stateIndex: number;
}>();
const emit = defineEmits<{
  selectState: [index: number];
  unpin: [id: string];
  clearPins: [];
  sample: [];
}>();
function labelOf(id: string): string {
  return props.document.nodes.find((node) => node.id === id)?.label ?? id;
}
const classification = computed(() => {
  const a = props.analysis;
  if (a.error) return { tone: "error", text: "无法完整分析", detail: a.error };
  if (a.status === "none")
    return {
      tone: "none",
      text: "无稳定解",
      detail: "当前输入与钉住条件下，不存在任何自洽的稳定状态。",
    };
  if (a.status === "multiple")
    return {
      tone: "multi",
      text: `多种稳定 · ${a.states.length}${a.truncated ? "+" : ""} 种`,
      detail: "存在多个同样自洽的状态，电路实际停留在哪里取决于通电顺序与历史。",
    };
  if (a.inputDependent === true)
    return {
      tone: "dep",
      text: "受输入控制后才稳定",
      detail:
        "当前输入下有唯一稳定状态，但某些输入组合下会变成多稳态或无解——稳定性由输入维持。",
    };
  if (a.inputDependent === null)
    return {
      tone: "unique",
      text: "唯一稳定 · 当前输入",
      detail: "当前输入下唯一稳定；输入超过 6 个，未逐一核对全部输入组合。",
    };
  return {
    tone: "unique",
    text: "唯一稳定",
    detail: "已核对全部输入组合：任何输入下都恰好只有一个稳定状态。",
  };
});
const stateCount = computed(() => props.analysis.states.length);
const current = computed(() =>
  Math.min(props.stateIndex, Math.max(stateCount.value - 1, 0)),
);
const state = computed(() => props.analysis.states[current.value] ?? null);
const feedbackValues = computed(() => {
  if (!state.value) return [];
  return props.analysis.feedbackNodes.map((id) => ({
    id,
    label: labelOf(id),
    value: state.value!.values[id],
  }));
});
const pinList = computed(() =>
  Object.entries(props.document.pins ?? {}).map(([id, value]) => ({
    id,
    label: labelOf(id),
    value,
  })),
);
function loadSample() {
  if (
    window.confirm("载入 SR 锁存器示例会替换当前工作台，建议先导出。继续吗？")
  )
    emit("sample");
}
</script>
<template>
  <section class="research-panel" aria-label="反馈稳定状态分析">
    <div class="research-head">
      <span class="research-title">反馈分析 <small>STABILITY</small></span
      ><span class="stability-badge" :class="classification.tone">{{
        classification.text
      }}</span>
    </div>
    <p class="research-detail">{{ classification.detail }}</p>
    <p class="research-meta">
      <template v-if="analysis.feedbackNodes.length"
        >反馈环覆盖 {{ analysis.feedbackNodes.length }} 个元件 ·
        {{ analysis.feedbackWires.length }} 条环内连线；环内元件标有
        ↻，钉住条件随实验一起保存。</template
      ><template v-else
        >电路中没有反馈环，行为等同组合电路；模式与钉住条件随实验一起保存。</template
      >
    </p>
    <div v-if="stateCount" class="state-nav">
      <button
        :disabled="stateCount < 2"
        aria-label="上一个稳定状态"
        @click="emit('selectState', current - 1)"
      >
        ◀</button
      ><span
        >稳定状态 {{ current + 1 }} / {{ stateCount
        }}{{ analysis.truncated ? "+" : "" }}</span
      ><button
        :disabled="stateCount < 2"
        aria-label="下一个稳定状态"
        @click="emit('selectState', current + 1)"
      >
        ▶</button
      ><span class="state-values"
        ><span
          v-for="item in feedbackValues"
          :key="item.id"
          class="state-chip"
          :class="`chip-${item.value}`"
          >{{ item.label }}={{ item.value }}</span
        ></span
      >
    </div>
    <p v-else-if="!analysis.error" class="research-detail conflict-note">
      画布已标红形成矛盾的反馈线路。{{
        analysis.pinsCausedConflict
          ? "矛盾由当前钉住条件引起，可尝试清除钉住。"
          : "可调整输入电平，或检查环路的反相次数。"
      }}
    </p>
    <div class="pin-row">
      <span class="pin-label">钉住筛选</span
      ><template v-if="pinList.length"
        ><span v-for="pin in pinList" :key="pin.id" class="pin-chip"
          >{{ pin.label }} = {{ pin.value
          }}<button
            :aria-label="`取消钉住 ${pin.label}`"
            @click="emit('unpin', pin.id)"
          >
            ✕</button></span
        ><button class="text-button" @click="emit('clearPins')">
          全部清除
        </button></template
      ><span v-else class="pin-hint"
        >点击元件左下角 ⌖ 钉住内部信号（0 / 1），仅显示符合的稳定状态；再次点击切换或松开。</span
      >
    </div>
    <div class="research-foot">
      <button @click="loadSample">载入 SR 锁存器示例</button
      ><span class="research-note"
        >分析枚举反馈环的全部联合稳定状态，不做单点迭代猜测。</span
      >
    </div>
  </section>
</template>
