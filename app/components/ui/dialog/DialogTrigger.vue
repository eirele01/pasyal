<script setup lang="ts">
import { DialogTrigger } from 'reka-ui'

interface Props {
  as?: string
  asChild?: boolean
}

const props = defineProps<Props>()
</script>

<template>
  <DialogTrigger v-bind="props">
    <slot />
  </DialogTrigger>
</template>
