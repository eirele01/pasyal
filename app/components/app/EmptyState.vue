<script setup lang="ts">
/**
 * Shared empty state (NFR-UX-06): a dashed card with a plain-language
 * title, an optional description and an optional call-to-action slot,
 * so every screen's "nothing here yet" looks and reads the same.
 */
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div
    class="glass rounded-2xl border-dashed px-6 py-10 text-center"
    role="status"
    data-testid="empty-state"
  >
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
    <div v-if="$slots.action" class="mt-4 flex flex-wrap justify-center gap-2">
      <slot name="action" />
    </div>
  </div>
</template>
