<script setup lang="ts">
import { DialogClose } from 'reka-ui'

interface Props {
  as?: string
  asChild?: boolean
}

const props = defineProps<Props>()
</script>

<template>
  <DialogClose v-bind="props">
    <slot />
  </DialogClose>
</template>
