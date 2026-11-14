<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { Primitive } from 'reka-ui'
import { type BadgeVariants, badgeVariants } from '.'
import { cn } from '@/lib/utils'

// Local mirror of Reka UI's PrimitiveProps (as / asChild) — declared here
// because the SFC compiler cannot always resolve type-only imports from
// reka-ui inside defineProps() (same as Button.vue).
interface Props {
  as?: string
  asChild?: boolean
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'span',
})

const delegatedProps = computed(() => {
  const { class: _, variant, ...delegated } = props
  return delegated
})
</script>

<template>
  <Primitive
    v-bind="delegatedProps"
    :class="cn(badgeVariants({ variant }), props.class)"
  >
    <slot />
  </Primitive>
</template>
