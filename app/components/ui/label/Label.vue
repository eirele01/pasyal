<script setup lang="ts">
import type { HTMLAttributes, LabelHTMLAttributes } from 'vue'
import { computed } from 'vue'
import { Label } from 'reka-ui'
import { cn } from '@/lib/utils'

// Local mirror of Reka UI's LabelProps ({ for }) — declared here because the
// SFC compiler cannot always resolve type-only imports from reka-ui inside
// defineProps().
interface Props {
  for?: LabelHTMLAttributes['for']
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <Label
    v-bind="delegatedProps"
    :class="
      cn(
        'flex select-none items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
  </Label>
</template>
