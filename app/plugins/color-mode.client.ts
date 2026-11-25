/**
 * v2-13 liquid glass: wire the app's (already built and
 * contrast-verified — style-guide.md §9) dark scheme to the system
 * preference. Until now nothing ever set the `.dark` class, so the
 * dark tokens, `dark:` variants and `html.dark` landing rules were
 * dormant code and every user got the light theme regardless of their
 * OS setting. This is presentation-only: toggle one class on <html>,
 * keep it in sync when the OS switches, nothing else.
 *
 * Client-only on purpose: the class is absent in the SSR HTML (no
 * hydration diff on <html> attributes Vue does not own) and appears
 * before first paint of the hydrated app.
 */
export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return

  const media = window.matchMedia('(prefers-color-scheme: dark)')

  const apply = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
  }

  apply(media.matches)

  // Follow the OS live (iOS/Android control-center switches, OS-level
  // scheduling). The legacy addListener path covers old WebViews; the
  // reduced-motion block in tailwind.css collapses nothing here (no
  // animation involved).
  if (media.addEventListener) {
    media.addEventListener('change', (event) => apply(event.matches))
  } else if (media.addListener) {
    media.addListener((event) => apply(event.matches))
  }
})
