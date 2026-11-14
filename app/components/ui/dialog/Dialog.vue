<script setup lang="ts">
import { DialogRoot } from 'reka-ui'

// Local mirror of Reka UI's DialogRootProps/DialogRootEmits — declared here
// because the SFC compiler cannot always resolve type-only imports from
// reka-ui inside defineProps()/defineEmits() (same as Button.vue).
interface Props {
  open?: boolean
  defaultOpen?: boolean
  modal?: boolean
}

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const props = defineProps<Props>()
</script>

<template>
  <!-- modal is passed explicitly (not through v-bind): an explicitly-set
       Boolean keeps reka-ui's DialogRoot context honest — with modal
       resolved through the spread it could arrive as `undefined`, which
       made DialogOverlay (the dimming scrim + scroll lock) silently skip
       rendering while the content still showed (latent since M2; found
       in the 2026-11-12 iOS pass). -->
  <DialogRoot v-bind="props" :modal="props.modal ?? true" @update:open="emit('update:open', $event)">
    <slot />
  </DialogRoot>
</template>
