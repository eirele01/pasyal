<script setup lang="ts">
/**
 * Expense-detail route wrapper (UI-08). The detail screen lives at
 * [expenseId]/index.vue and the edit screen at [expenseId]/edit.vue;
 * this wrapper is the Nuxt nesting point (same pattern as trips/[id].vue).
 */
definePageMeta({ middleware: 'auth' })
</script>

<template>
  <NuxtPage />
</template>
