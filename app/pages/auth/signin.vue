<script setup lang="ts">
/**
 * Sign in with email + password (FR-AUTH-01) or Google OAuth (FR-AUTH-02).
 * Also hosts the password-reset request form (FR-AUTH-08): the email is
 * sent by Supabase Auth through the configured SMTP sender (Resend once a
 * domain is verified — see SPEC Q-17/R-15), and the link lands on
 * /auth/reset-password. Supabase Auth is the only identity provider
 * (SPEC §1.5).
 */
import { describeAuthError } from '~/lib/authErrors'

useSeoMeta({ title: 'Sign in' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()

const email = ref('')
const password = ref('')
const loading = ref(false)
const googleLoading = ref(false)
const errorMessage = ref('')

// Password reset request state (FR-AUTH-08).
const resetMode = ref(false)
const resetEmail = ref('')
const resetSending = ref(false)
const resetSent = ref(false)

// Only allow internal redirect targets — never an external URL. Signed-in
// users land on their trips by default (FR-TRIP-03).
const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/trips'
})

onMounted(() => {
  if (user.value) {
    navigateTo(redirectTarget.value, { replace: true })
  }
})

async function signIn() {
  if (!email.value.trim() || !password.value) {
    errorMessage.value = 'Please enter your email and password.'
    return
  }
  loading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })
  loading.value = false
  if (error) {
    // Generic, non-revealing fallback (FR-AUTH-01): never say whether the
    // email exists. Only configuration/rate-limit errors get specific copy
    // (app/lib/authErrors.ts, 2026-11-11 hotfix).
    errorMessage.value = describeAuthError(
      error,
      'Sign-in failed. Check your email and password, then try again.',
    )
    return
  }
  await navigateTo(redirectTarget.value, { replace: true })
}

async function signInWithGoogle() {
  googleLoading.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Carry the redirect target through the OAuth round trip so invite
      // links survive Google sign-in too (FR-AUTH-07).
      redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTarget.value)}`,
    },
  })
  if (error) {
    googleLoading.value = false
    errorMessage.value = 'Google sign-in could not start. Please try again.'
  }
  // On success the browser redirects to Google; nothing more to do here.
}

/** Requests a password-reset email (FR-AUTH-08). */
async function requestPasswordReset() {
  if (!resetEmail.value.trim()) {
    errorMessage.value = 'Please enter the email you signed up with.'
    return
  }
  resetSending.value = true
  errorMessage.value = ''
  const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.value.trim(), {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  resetSending.value = false
  if (error) {
    errorMessage.value = describeAuthError(
      error,
      'Could not send the reset email. Please try again.',
    )
    return
  }
  resetSent.value = true
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12 sm:py-20">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p class="text-muted-foreground mt-2 text-sm">Sign in to your Pasyal account.</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Email and password, or continue with Google.</CardDescription>
      </CardHeader>

      <CardContent class="grid gap-4">
        <!-- Password reset request (FR-AUTH-08) -->
        <div v-if="resetMode" class="grid gap-4">
          <div v-if="!resetSent">
            <div class="grid gap-4">
              <div class="grid gap-2">
                <Label for="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  v-model="resetEmail"
                  type="email"
                  placeholder="you@example.com"
                  autocomplete="email"
                  required
                />
              </div>
              <p class="text-muted-foreground text-xs leading-relaxed">
                We'll email you a link to set a new password. The link expires and works only
                once.
              </p>
              <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
                {{ errorMessage }}
              </p>
              <div class="grid gap-2">
                <Button :disabled="resetSending" @click="requestPasswordReset">
                  {{ resetSending ? 'Sending…' : 'Send reset link' }}
                </Button>
                <Button
                  variant="ghost"
                  @click="((resetMode = false), (errorMessage = ''))"
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          </div>
          <div v-else class="grid gap-3 text-center">
            <p class="font-medium">Check your inbox</p>
            <p class="text-muted-foreground text-sm leading-relaxed">
              If an account exists for {{ resetEmail }}, a reset link is on its way. Open it and
              set your new password.
            </p>
            <Button variant="outline" @click="resetMode = false">Back to sign in</Button>
          </div>
        </div>

        <form v-else class="grid gap-4" @submit.prevent="signIn">
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
              autocomplete="current-password"
              required
            />
          </div>

          <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
            {{ errorMessage }}
          </p>

          <Button type="submit" :disabled="loading || googleLoading">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </Button>

          <button
            type="button"
            class="text-muted-foreground self-start text-sm underline-offset-4 hover:underline"
            @click="((resetMode = true), (errorMessage = ''))"
          >
            Forgot password?
          </button>
        </form>

        <div class="flex items-center gap-3">
          <Separator class="flex-1" />
          <span class="text-muted-foreground text-xs uppercase">or</span>
          <Separator class="flex-1" />
        </div>

        <Button variant="outline" :disabled="googleLoading || loading" @click="signInWithGoogle">
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
          {{ googleLoading ? 'Redirecting…' : 'Continue with Google' }}
        </Button>
      </CardContent>

      <CardFooter class="justify-center">
        <p class="text-muted-foreground text-sm">
          New here?
          <NuxtLink
            :to="{ path: '/auth/signup', query: route.query }"
            class="text-primary font-medium underline-offset-4 hover:underline"
          >
            Create an account
          </NuxtLink>
        </p>
      </CardFooter>
    </Card>

    <p class="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
      Location sharing is opt-in, off by default, and only works while the
      app is open.
    </p>
  </div>
</template>
