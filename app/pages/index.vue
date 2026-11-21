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
 *
 * v2.12 (D49) — the SEO surface: a keyword-bearing title/description,
 * canonical URL, Open Graph + Twitter card tags (image: the generated
 * /images/og-card.png) and WebApplication JSON-LD — everything a
 * crawler or social feed needs, baked into the prerendered HTML. The
 * origin is runtimeConfig.public.siteUrl (default https://pasyalph.com);
 * docs/seo-guide.md covers the owner's side (Search Console, Bing,
 * social debuggers, marketing surfaces).
 */
const siteUrl = useRuntimeConfig().public.siteUrl
const canonical = `${siteUrl}/`
const ogImage = `${siteUrl}/images/og-card.png`

// Keyword-bearing but honest: the full brand title, verbatim. The
// config-level titleTemplate is a function, which unhead only applies
// after hydration — the raw crawler HTML would get the bare title — so
// this page disables the template and ships the complete string in the
// prerendered HTML (52 chars).
const title = 'Group travel planner & shared expense app · Pasyal'
const description =
  'Plan group trips with friends and skip the spreadsheet — shared expenses, itinerary and live location in one installable web app.'

useSeoMeta({
  title,
  description,
  // Open Graph (Facebook, LinkedIn, WhatsApp, Messenger, iMessage …)
  ogTitle: 'Pasyal — Group travel, sorted',
  ogDescription: description,
  ogType: 'website',
  ogUrl: canonical,
  ogSiteName: 'Pasyal',
  ogLocale: 'en',
  ogImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'The Pasyal app — group travel, sorted.',
  // X/Twitter (+ fallback for scrapers that read twitter:* first)
  twitterCard: 'summary_large_image',
  twitterTitle: 'Pasyal — Group travel, sorted',
  twitterDescription: description,
  twitterImage: ogImage,
})

useHead({
  // See the `title` note above: no template on this page — the title is
  // already the complete brand string, in the prerendered HTML too.
  titleTemplate: null,
  link: [{ rel: 'canonical', href: canonical }],
  script: [
    {
      // WebApplication structured data — the machine-readable feature
      // list search engines (and AI answer engines) surface for
      // "group travel expense app"-style queries. Static, owner-authored
      // strings only; safe as an inline script under the CSP.
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Pasyal',
        url: canonical,
        description,
        applicationCategory: 'TravelApplication',
        operatingSystem: 'Any',
        inLanguage: 'en',
        featureList: [
          'Shared trip expenses with fair splits and balances',
          'Group itinerary planning',
          'Live location sharing on a shared map',
          'Works offline (installable PWA)',
        ],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      }),
    },
  ],
})
</script>

<template>
  <LandingStory />
</template>
