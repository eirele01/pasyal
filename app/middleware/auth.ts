/**
 * Protects a route: unauthenticated visitors are sent to the sign-in page
 * and returned to the original route after signing in (the same pattern
 * FR-AUTH-07 will use for invite links).
 *
 * The Supabase session lives in the browser, so the check is only
 * meaningful on the client; pages that need it (see `/account`) are
 * rendered client-side via routeRules.
 */
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  if (import.meta.server) return

  if (!user.value) {
    return navigateTo({ path: '/auth/signin', query: { redirect: to.fullPath } })
  }
})
