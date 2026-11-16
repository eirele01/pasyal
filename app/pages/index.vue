<script setup lang="ts">
/**
 * The landing page (v2.10, D39): an immersive, scroll-driven story —
 * Hero → Plan → Money → Map → Works anywhere → Final CTA — with the
 * sea-turtle mascot along the way. All animation is CSS scroll-driven
 * (compositor-only, zero listeners) with an IntersectionObserver
 * reveal fallback; see app/components/landing/LandingStory.vue.
 *
 * The page stays prerendered (routeRules '/') and the session-aware
 * CTAs keep the v2.7 D35 pattern inside the chapters.
 */
useSeoMeta({
  title: 'Group travel, sorted',
  description:
    'Pasyal keeps your group trip expenses, itinerary and live location in one place — built for trips with friends.',
})
</script>

<template>
  <LandingStory />
</template>
