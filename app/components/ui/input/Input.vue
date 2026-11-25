<script setup lang="ts">
import type { HTMLAttributes, InputHTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  type?: InputHTMLAttributes['type']
}>()

const model = defineModel<string | number>()
</script>

<template>
  <input
    v-model="model"
    :type="props.type ?? 'text'"
    :class="
      cn(
        // v2-13 liquid glass: the shared .field material (tailwind.css) —
        // translucent well, hairline border, inset shadow, one focus
        // ring for every field in the app. The utilities below only add
        // sizing, file-button and invalid-state behavior on top.
        'field file:text-foreground selection:bg-primary selection:text-primary-foreground flex h-10 w-full min-w-0 px-3.5 py-1 text-base md:text-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        props.class,
      )
    "
  />
</template>
