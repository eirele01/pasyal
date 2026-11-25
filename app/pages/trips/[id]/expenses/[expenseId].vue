<script setup lang="ts">
/**
 * Expense-detail route wrapper (UI-08). The detail screen lives at
 * [expenseId]/index.vue and the edit screen at [expenseId]/edit.vue;
 * this wrapper is the Nuxt nesting point (same pattern as trips/[id].vue).
 *
 * v2-13-10: NuxtPage must NOT be this wrapper's bare root. A bare
 * component root inside the trip wrapper's page <Transition> is a
 * non-element root Vue cannot animate — every detail↔edit swap logged
 * "Component inside <Transition> renders non-element root node that
 * cannot be animated" in dev (the owner's v2-13-9 manual pass). The
 * single wrapping <div> gives the transition an animatable element
 * root, exactly like trips/[id].vue wraps its NuxtPage in a root div.
 * The div itself is inert (no classes) — it renders no visual chrome.
 */
definePageMeta({ middleware: 'auth' })
</script>

<template>
  <div>
    <NuxtPage />
  </div>
</template>
