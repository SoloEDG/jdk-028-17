<script setup lang="ts">
import type { TruthRow } from "../lib/truthTable";
defineProps<{
  rows: TruthRow[];
  a: number | undefined;
  b: number | undefined;
  inspected: boolean;
  research?: boolean;
}>();
</script>
<template>
  <table class="truth-table">
    <thead>
      <tr>
        <th>A</th>
        <th>B</th>
        <th>目标 Y</th>
        <th>{{ research ? "稳定状态" : "实际 Y" }}</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="`${row.a}${row.b}`"
        :class="{ 'current-row': row.a === a && row.b === b }"
      >
        <td>{{ row.a }}</td>
        <td>{{ row.b }}</td>
        <td>{{ row.expected }}</td>
        <td
          v-if="!research"
          :class="{
            mismatch: inspected && !row.matches,
            match: inspected && row.matches,
          }"
        >
          {{ row.actual
          }}<span v-if="inspected">{{ row.matches ? " ✓" : " ×" }}</span>
        </td>
        <td
          v-else
          :class="{
            mismatch: inspected && !row.matches,
            match: inspected && row.matches,
          }"
        >
          <template v-if="row.stableCount === 0">无稳定状态</template>
          <template v-else-if="row.matchCount === row.stableCount"
            >{{ row.expected }} · 全部 {{ row.stableCount }} 态</template
          >
          <template v-else-if="row.matchCount === 0"
            >{{ 1 - row.expected }} · {{ row.stableCount }} 态均不符</template
          >
          <template v-else
            >部分 {{ row.matchCount }}/{{ row.stableCount }} 态</template
          ><span v-if="inspected">{{ row.matches ? " ✓" : " ×" }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
