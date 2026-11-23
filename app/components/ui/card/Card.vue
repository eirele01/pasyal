<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()

// iOS pass (2026-11-12, style-guide.md): white cards floating on the
// grouped gray page. v2-13 liquid glass: the card IS the .glass material
// now — translucent (the canvas's emerald washes glow through), hairline
// border, specular top edge, ambient shadow. Corners up to 20 px
// (rounded-2xl) for the softer, concentric glass silhouette.
</script>

<template>
  <div
    :class="
      cn(
        'glass text-card-foreground flex flex-col gap-4 rounded-2xl py-6',
        props.class,
      )
    "
  >
    <slot />
  </div>
</template>
