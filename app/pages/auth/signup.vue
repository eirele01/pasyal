<script setup lang="ts">
/**
 * Sign up with email + password (FR-AUTH-01) and a display name that is
 * stored on the profile (FR-AUTH-03). The database trigger
 * `on_auth_user_created` copies `display_name` from the sign-up metadata
 * into `public.profiles`.
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
        <CardDescription>Email and password. Google sign-in is available on the
          sign-in page.</CardDescription>
      </CardHeader>

      <CardContent>
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

        <form v-else class="grid gap-4" @submit.prevent="signUp">
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

          <Button type="submit" :disabled="loading">
            {{ loading ? 'Creating account…' : 'Create account' }}
          </Button>
        </form>
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
