/**
 * Landing-page motion controller (v2.10, D39).
 *
 * The landing's scrubbed animations are pure CSS scroll-driven
 * animations (animation-timeline: view() / scroll()) — compositor-run,
 * zero scroll listeners, zero JS cost. This composable exists only for
 * browsers WITHOUT that support (pre-115 Chromium engines, iOS ≤ 18
 * Safari, Firefox < 159) and nobody else:
 *
 *   • SDA supported + motion allowed → return immediately; CSS does
 *     everything (chapter scrubbing, reveals, the mascot).
 *   • prefers-reduced-motion: reduce → return immediately; the base
 *     stylesheet already renders every chapter fully visible, static
 *     and unpinned.
 *   • No SDA → add `landing--reveal` to the story root and reveal
 *     `.landing-reveal` elements one by one with a single
 *     IntersectionObserver. Each element is observed exactly once and
 *     the observer disconnects when everything has been revealed.
 *
 * `?landing=static` forces the fallback path even in SDA browsers —
 * the Playwright suite uses that hook to exercise the reveal path in
 * Chromium (which otherwise always takes the SDA branch).
 *
 * The hook is read from `bootSearch`, captured at MODULE-EVAL time:
 * the landing route is prerendered, its payload carries the route as
 * '/' and Nuxt's hydration syncs the URL to it — stripping any query
 * before components mount (measured on the production build). At
 * module-eval the original URL is still intact.
 */
const bootSearch =
  typeof window !== 'undefined' ? window.location.search : ''

export function useLandingMotion() {
  const root = ref<HTMLElement | null>(null)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    const el = root.value
    if (!el || typeof window === 'undefined') return

    // Reduced motion: the static layout is already complete — no JS.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sda =
      typeof CSS !== 'undefined' &&
      CSS.supports('animation-timeline: view()')
    const forcedFallback =
      new URLSearchParams(bootSearch).get('landing') === 'static'
    if (sda && !forcedFallback) return

    const targets = Array.from(el.querySelectorAll<HTMLElement>('.landing-reveal'))
    if (!targets.length) return

    el.classList.add('landing--reveal')
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-revealed')
          observer?.unobserve(entry.target)
        }
      },
      { threshold: 0 },
    )
    for (const target of targets) observer.observe(target)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { root }
}
