<script setup lang="ts">
/**
 * Sign up with email + password (FR-AUTH-01) and a display name that is
 * stored on the profile (FR-AUTH-03), or with Google (FR-AUTH-02, added
 * v2.8 — the same OAuth flow as the sign-in page). The database trigger
 * `on_auth_user_created` copies `display_name` from the sign-up metadata
 * into `public.profiles` (for Google accounts it falls back to the email
 * prefix, since Google sends `full_name`, not `display_name` — the name
 * is editable on the Account page).
 *
 * Depending on the "Confirm email" setting of the Supabase project, sign-up
 * either signs the user in immediately or asks them to confirm first
 * (FR-AUTH-09 — email delivery is configured in the dashboard, see README).
 */
import { describeAuthError } from '~/lib/authErrors'

// Onboarding tour (owner-requested, 2026-11-13): a fresh account queues
// the guided tour — it auto-starts when the user lands on /trips online.
const { markPending: queueTour } = useTour()

useSeoMeta({ title: 'Create your account' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()

const displayName = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const googleLoading = ref(false)
const errorMessage = ref('')
const confirmationNeeded = ref(false)

const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/trips'
})

function validate(): string | null {
  if (!displayName.value.trim()) return 'Please enter a display name.'
  if (!email.value.trim()) return 'Please enter your email address.'
  if (password.value.length < 8) return 'Passwords must be at least 8 characters.'
  if (!/[a-zA-Z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    return 'Passwords must include at least one letter and one number.'
  }
  return null
}

onMounted(() => {
  if (user.value) {
    navigateTo(redirectTarget.value, { replace: true })
  }
})

async function signUp() {
  errorMessage.value = validate() ?? ''
  if (errorMessage.value) return

  loading.value = true
  const { data, error } = await supabase.auth.signUp({
    email: email.value.trim(),
    password: password.value,
    options: {
      data: { display_name: displayName.value.trim() },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  loading.value = false

  if (error) {
    // Actionable copy incl. the Supabase email-validator and apikey
    // gateway cases (app/lib/authErrors.ts, 2026-11-11 hotfix).
    errorMessage.value = describeAuthError(
      error,
      'Sign-up failed. Please check your details and try again.',
      { revealAccountState: true },
    )
    return
  }

  if (data.session) {
    // Email confirmation disabled: the user is signed in right away.
    // Fresh account → the guided tour starts on the Trips page.
    queueTour()
    await navigateTo(redirectTarget.value, { replace: true })
    return
  }

  // Confirmation email sent: queue the tour for when they come back
  // signed in (same browser).
  queueTour()
  confirmationNeeded.value = true
}

async function signUpWithGoogle() {
  googleLoading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Carry the redirect target through the OAuth round trip so invite
      // links survive Google sign-up too (FR-AUTH-07) — same as sign-in.
      redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTarget.value)}`,
    },
  })
  if (error) {
    googleLoading.value = false
    errorMessage.value = 'Google sign-up could not start. Please try again.'
  }
  // On success the browser redirects to Google; nothing more to do here.
  // The guided tour is NOT queued on this path: at click time we cannot
  // know whether the Google account is new (the sign-in page's Google
  // button behaves the same) — a fresh Google account can start the tour
  // from Settings → "Show the tour again".
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12 sm:py-20">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight">Create your account</h1>
      <p class="text-muted-foreground mt-2 text-sm">
        One account for every trip you take with friends.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>Email and password, or sign up with Google.</CardDescription>
      </CardHeader>

      <CardContent class="grid gap-4">
        <div v-if="confirmationNeeded" class="grid gap-3 text-center">
          <p class="font-medium">Check your inbox</p>
          <p class="text-muted-foreground text-sm leading-relaxed">
            We sent a confirmation link to <strong>{{ email }}</strong
            >. Open it to activate your account, then sign in.
          </p>
          <Button variant="outline" as-child>
            <NuxtLink to="/auth/signin">Back to sign in</NuxtLink>
          </Button>
        </div>

        <template v-else>
          <form class="grid gap-4" @submit.prevent="signUp">
            <div class="grid gap-2">
              <Label for="display-name">Display name</Label>
              <Input
                id="display-name"
                v-model="displayName"
                placeholder="Ana"
                autocomplete="name"
                required
              />
              <p class="text-muted-foreground text-xs">Shown on expenses, member lists and the map.</p>
            </div>

            <div class="grid gap-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                required
              />
            </div>

            <div class="grid gap-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                required
              />
              <p class="text-muted-foreground text-xs">At least 8 characters, with a letter and a number.</p>
            </div>

            <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
              {{ errorMessage }}
            </p>

            <Button type="submit" :disabled="loading || googleLoading">
              {{ loading ? 'Creating account…' : 'Create account' }}
            </Button>
          </form>

          <div class="flex items-center gap-3">
            <Separator class="flex-1" />
            <span class="text-muted-foreground text-xs uppercase">or</span>
            <Separator class="flex-1" />
          </div>

          <Button
            variant="outline"
            :disabled="googleLoading || loading"
            @click="signUpWithGoogle"
          >
            <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {{ googleLoading ? 'Redirecting…' : 'Sign up with Google' }}
          </Button>
        </template>
      </CardContent>

      <CardFooter class="justify-center">
        <p class="text-muted-foreground text-sm">
          Already have an account?
          <NuxtLink
            :to="{ path: '/auth/signin', query: route.query }"
            class="text-primary font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </NuxtLink>
        </p>
      </CardFooter>
    </Card>
  </div>
</template>
