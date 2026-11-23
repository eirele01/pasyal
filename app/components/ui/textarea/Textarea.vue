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
        // v2-13 liquid glass: the shared .field material, same as Input.
        'field flex min-h-[72px] w-full px-3.5 py-2.5 text-base md:text-sm',
        'disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  />
</template>
