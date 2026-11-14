<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()

// iOS pass (2026-11-12, style-guide.md): white cards floating on the
// grouped gray page — 16 px corners, hairline border, whisper shadow,
// tighter header/content rhythm (gap-4).
</script>

<template>
  <div
    :class="
      cn(
        'bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-6 shadow-sm',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
