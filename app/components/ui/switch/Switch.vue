<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { cn } from '@/lib/utils'

/**
 * shadcn-vue Switch — vendored base component (built on Reka UI, already a
 * project dependency; no new npm package). Used by the M4 sharing and demo
 * toggles (FR-LOC-02, FR-LOC-15).
 *
 * Local mirror of Reka UI's SwitchRootProps/Emits — declared here because
 * the SFC compiler cannot always resolve type-only imports from reka-ui
 * inside defineProps()/defineEmits() (same as Dialog.vue / Button.vue).
 */
interface Props {
  modelValue?: boolean
  defaultValue?: boolean
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  class?: HTMLAttributes['class']
}

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const props = defineProps<Props>()

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props
  return delegated
})

// iOS pass (2026-11-12, style-guide.md): UISwitch dimensions (52 × 31)
// with a 26 px thumb on a soft shadow. The coarse-pointer CSS expands
// the tap area invisibly via ::after — the track itself must NOT be
// stretched to 44 px.
</script>

<template>
  <SwitchRoot
    v-bind="delegatedProps"
    :class="
      cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-[1.95rem] w-[3.25rem] shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all duration-200 ease-ios outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
    @update:model-value="emit('update:modelValue', $event as boolean)"
  >
    <SwitchThumb
      class="bg-background pointer-events-none block size-[1.6rem] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] ring-0 transition-transform duration-200 ease-ios data-[state=checked]:translate-x-[1.4rem] data-[state=unchecked]:translate-x-[0.125rem]"
    />
  </SwitchRoot>
</template>
