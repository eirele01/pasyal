<script setup lang="ts">
/**
 * OAuth / email-redirect landing page (FR-AUTH-02, FR-AUTH-08).
 *
 * Supabase redirects back here with a PKCE code in the URL. The client
 * created in the `supabase` plugin has `detectSessionInUrl` enabled and
 * exchanges the code for a session automatically; this page just waits for
 * the session to appear, then routes to the redirect target (invite links
 * survive the OAuth round trip — FR-AUTH-07) or the trip list.
 */
useSeoMeta({ title: 'Completing sign-in' })

const route = useRoute()
const supabase = useSupabase()

const status = ref<'working' | 'error'>('working')
const errorMessage = ref('')

// Internal redirect targets only (FR-AUTH-07).
const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/trips'
})

onMounted(async () => {
  const urlError = route.query.error_description
  if (typeof urlError === 'string' && urlError) {
    status.value = 'error'
    errorMessage.value = urlError
    return
  }

  // getSession resolves as soon as the code exchange finishes.
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await navigateTo(redirectTarget.value, { replace: true })
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  status.value = 'error'
  errorMessage.value = 'Sign-in did not complete in time. Please try again.'
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-24">
    <Card>
      <CardContent class="grid gap-3 py-6 text-center">
        <template v-if="status === 'working'">
          <div
            class="border-primary border-t-primary mx-auto size-6 animate-spin rounded-full border-2"
            aria-hidden="true"
          />
          <p class="font-medium">Completing sign-in…</p>
          <p class="text-muted-foreground text-sm">Hang on, this only takes a moment.</p>
        </template>
        <template v-else>
          <p class="font-medium">Sign-in failed</p>
          <p class="text-destructive text-sm">{{ errorMessage }}</p>
          <Button variant="outline" as-child>
            <NuxtLink to="/auth/signin">Back to sign in</NuxtLink>
          </Button>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
