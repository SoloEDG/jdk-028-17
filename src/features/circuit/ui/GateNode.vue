<script setup lang="ts">
import { computed } from "vue";
import type { GateNode, Signal } from "@/shared/types";
import type { PortRequest } from "@/shared/commands";
import { getSpec } from "@/features/catalog";
import { BOARD, portPoint } from "../lib/geometry";
const props = defineProps<{
  node: GateNode;
  value: Signal;
  selected: boolean;
  pending: boolean;
  research?: boolean;
  satisfied?: boolean | null;
  pinned?: 0 | 1 | null;
  conflict?: boolean;
  inLoop?: boolean;
}>();
const emit = defineEmits<{
  select: [id: string];
  startDrag: [event: PointerEvent, id: string];
  port: [port: PortRequest];
  toggle: [id: string];
  pin: [id: string];
}>();
const spec = computed(() => getSpec(props.node.kind));
const isPinned = computed(
  () => props.pinned !== null && props.pinned !== undefined,
);
</script>
<template>
  <g
    class="gate-node"
    :class="{ 'is-selected': selected, 'is-conflict': conflict }"
    :data-node="node.id"
    role="group"
    tabindex="0"
    :aria-label="node.label"
    @keydown.enter.self="emit('select', node.id)"
    ><rect
      :x="node.x"
      :y="node.y"
      :width="BOARD.nodeWidth"
      :height="BOARD.nodeHeight"
      rx="10"
      class="node-body"
      @pointerdown.stop="emit('startDrag', $event, node.id)" /><text
      :x="node.x + 12"
      :y="node.y + 21"
      class="node-label"
      pointer-events="none"
      >{{ node.label }}</text
    ><text
      :x="node.x + 56"
      :y="node.y + 57"
      class="node-symbol"
      pointer-events="none"
      >{{ spec.symbol }}</text
    ><g
      v-if="node.kind === 'INPUT'"
      role="button"
      tabindex="0"
      :aria-label="`切换 ${node.label}，当前 ${value}`"
      @pointerdown.stop
      @click.stop="emit('toggle', node.id)"
      @keydown.enter.prevent="emit('toggle', node.id)"
      @keydown.space.prevent="emit('toggle', node.id)"
      ><rect
        :x="node.x + 74"
        :y="node.y + 42"
        width="27"
        height="28"
        rx="6"
        :class="`switch signal-${value}`"
      /><text :x="node.x + 87" :y="node.y + 61" class="switch-text">{{
        value
      }}</text></g
    ><g v-if="node.kind === 'OUTPUT'"
      ><circle
        :cx="node.x + 88"
        :cy="node.y + 52"
        r="11"
        :class="`output-led signal-${value}`"
      /><text :x="node.x + 88" :y="node.y + 57" class="led-text">{{
        value
      }}</text></g
    ><template v-if="research && node.kind !== 'INPUT'"
      ><g v-if="satisfied !== null && satisfied !== undefined"
        ><circle
          :cx="node.x + 100"
          :cy="node.y + 13"
          r="8"
          class="sat-badge"
          :class="satisfied ? 'sat-ok' : 'sat-bad'"
        /><text
          :x="node.x + 100"
          :y="node.y + 17"
          class="sat-text"
          :class="satisfied ? 'sat-ok-text' : 'sat-bad-text'"
          >{{ satisfied ? "✓" : "✗" }}</text
        ></g
      ><text
        v-else-if="inLoop"
        :x="node.x + 100"
        :y="node.y + 17"
        class="loop-mark"
        >↻</text
      ><g
        role="button"
        tabindex="0"
        class="pin-anchor"
        :aria-label="
          isPinned
            ? `${node.label} 已钉住为 ${pinned}，点击切换`
            : `钉住 ${node.label} 以筛选稳定状态`
        "
        @pointerdown.stop
        @click.stop="emit('pin', node.id)"
        @keydown.enter.prevent="emit('pin', node.id)"
        @keydown.space.prevent="emit('pin', node.id)"
        ><circle
          :cx="node.x + 13"
          :cy="node.y + 73"
          r="8"
          class="pin-dot"
          :class="{ pinned: isPinned }"
        /><text
          :x="node.x + 13"
          :y="node.y + 76.5"
          class="pin-text"
          :class="{ pinned: isPinned }"
          >{{ isPinned ? pinned : "⌖" }}</text
        ></g
      ></template
    ><circle
      v-for="port in spec.inputs"
      :key="`in${port}`"
      :cx="portPoint(node, 'input', port - 1).x"
      :cy="portPoint(node, 'input', port - 1).y"
      r="7"
      class="port input-port"
      role="button"
      tabindex="0"
      :aria-label="`${node.label} 输入 ${port}`"
      @pointerdown.stop
      @click.stop="
        emit('port', { nodeId: node.id, port: port - 1, direction: 'input' })
      "
      @keydown.enter="
        emit('port', { nodeId: node.id, port: port - 1, direction: 'input' })
      " /><circle
      v-if="spec.outputs"
      :cx="portPoint(node, 'output').x"
      :cy="portPoint(node, 'output').y"
      r="7"
      :class="['port', `signal-${value}`, { 'port-pending': pending }]"
      role="button"
      tabindex="0"
      :aria-label="`${node.label} 输出端口`"
      @pointerdown.stop
      @click.stop="
        emit('port', { nodeId: node.id, port: 0, direction: 'output' })
      "
      @keydown.enter="
        emit('port', { nodeId: node.id, port: 0, direction: 'output' })
      "
  /></g>
</template>
