<script setup lang="ts">
import { computed } from "vue";
import type { CircuitDocument } from "@/shared/types";
import type { Target } from "../lib/targets";
import type { TruthRow } from "../lib/truthTable";
import { targets } from "../lib/targets";
import TruthTable from "./TruthTable.vue";
const props = defineProps<{
  document: CircuitDocument;
  target: Target;
  table: { rows: TruthRow[]; error: string | null };
  passed: boolean;
  inspected: boolean;
  hint: boolean;
}>();
defineEmits<{ choose: [id: string]; check: []; hint: [] }>();
const research = computed(
  () => (props.document.mode ?? "combinational") === "research",
);
const researchSummary = computed(() => {
  const rows = props.table.rows;
  if (rows.some((row) => (row.stableCount ?? 0) === 0))
    return "部分输入组合没有稳定状态可检查";
  if (rows.some((row) => !row.matches && (row.matchCount ?? 0) > 0))
    return "目标仅在部分稳定状态成立";
  return "目标在所有稳定状态均不成立";
});
</script>
<template>
  <aside class="challenge panel">
    <div class="panel-heading"><span>实验目标</span><small>MISSION</small></div>
    <label class="target-label" for="target">选择实验</label
    ><select
      id="target"
      :value="target.id"
      @change="$emit('choose', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="item in targets" :key="item.id" :value="item.id">
        {{ item.title }}
      </option>
    </select>
    <div class="mission-mark">{{ target.formula }}</div>
    <h2>{{ target.title }}</h2>
    <p class="mission-brief">{{ target.brief }}</p>
    <div class="table-heading">
      完整真值表
      <span>{{ research ? "4 种输入 × 全部稳定状态" : "4 种输入" }}</span>
    </div>
    <p v-if="table.error" class="inline-error">{{ table.error }}</p>
    <TruthTable
      v-else
      :rows="table.rows"
      :a="
        document.nodes.find((n) => n.label === 'A' && n.kind === 'INPUT')?.value
      "
      :b="
        document.nodes.find((n) => n.label === 'B' && n.kind === 'INPUT')?.value
      "
      :inspected="inspected"
      :research="research"
    /><button class="primary check-button" @click="$emit('check')">
      检测电路 <span>↗</span>
    </button>
    <p
      v-if="inspected"
      class="check-result"
      :class="passed ? 'passed' : 'failed'"
      role="status"
    >
      {{
        passed
          ? research
            ? "✓ 实验成功：全部输入组合的所有稳定状态均符合目标"
            : "✓ 实验成功，全部输入组合通过"
          : table.error
            ? "请先完成输入和输出配置"
            : research
              ? researchSummary
              : `尚有 ${table.rows.filter((r) => !r.matches).length} 种输入未通过`
      }}
    </p>
    <button class="text-button" @click="$emit('hint')">
      {{ hint ? "收起实验提示" : "需要一点提示？" }}
    </button>
    <p v-if="hint" class="hint">{{ target.hint }}</p>
    <div class="lab-note">
      <b>实验手记</b>
      <p>
        先预测，再切换输入验证。检测会遍历所有输入组合，不会改变开关位置。{{
          research ? "研究模式下还会枚举每种输入组合的全部稳定状态。" : ""
        }}
      </p>
    </div>
  </aside>
</template>
