<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const model = defineModel<string | number>()
</script>

<template>
  <textarea
    v-model="model"
    :class="
      cn(
        'border-input placeholder:text-muted-foreground focus-visible:ring-ring dark:bg-input/30 flex min-h-[72px] w-full rounded-lg border bg-transparent px-3.5 py-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
