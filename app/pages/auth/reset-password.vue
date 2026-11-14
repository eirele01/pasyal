<script setup lang="ts">
/**
 * Set a new password (FR-AUTH-08, M).
 *
 * The reset email links here (resetPasswordForEmail → redirectTo this page).
 * The Supabase client created in the plugin has detectSessionInUrl enabled,
 * so the PKCE code in the URL is exchanged automatically when the page
 * loads; once a session appears we let the user set a new password.
 * Links expire and work once — enforced by Supabase Auth.
 */
import { describeAuthError } from '~/lib/authErrors'

useSeoMeta({ title: 'Set a new password' })

const supabase = useSupabase()

const status = ref<'waiting' | 'ready' | 'expired'>('waiting')
const password = ref('')
const confirmPassword = ref('')
const saving = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  // Wait for the code exchange to finish and the session to appear.
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      status.value = 'ready'
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  status.value = 'expired'
})

async function savePassword() {
  if (password.value.length < 8 || !/[a-zA-Z]/.test(password.value) || !/[0-9]/.test(password.value)) {
    errorMessage.value = 'Passwords must be at least 8 characters, with a letter and a number.'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'The two passwords do not match.'
    return
  }

  saving.value = true
  const { error } = await supabase.auth.updateUser({ password: password.value })
  saving.value = false

  if (error) {
    errorMessage.value = describeAuthError(
      error,
      'Could not update the password. Please try the reset link again.',
    )
    return
  }

  await navigateTo('/trips', { replace: true })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-12 sm:py-20">
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your Pasyal account.</CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="status === 'waiting'" class="grid gap-3 py-4 text-center">
          <div
            class="border-primary border-t-primary mx-auto size-6 animate-spin rounded-full border-2"
            aria-hidden="true"
          />
          <p class="text-muted-foreground text-sm">Checking your reset link…</p>
        </div>

        <div v-else-if="status === 'expired'" class="grid gap-3 py-4 text-center">
          <p class="font-medium">This link is no longer valid</p>
          <p class="text-muted-foreground text-sm leading-relaxed">
            Reset links expire and work only once. Request a new one from the sign-in page.
          </p>
          <Button variant="outline" as-child>
            <NuxtLink to="/auth/signin">Back to sign in</NuxtLink>
          </Button>
        </div>

        <form v-else class="grid gap-4" @submit.prevent="savePassword">
          <div class="grid gap-2">
            <Label for="new-password">New password</Label>
            <Input
              id="new-password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              required
            />
            <p class="text-muted-foreground text-xs">At least 8 characters, with a letter and a number.</p>
          </div>
          <div class="grid gap-2">
            <Label for="confirm-password">Repeat the new password</Label>
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              required
            />
          </div>

          <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
            {{ errorMessage }}
          </p>

          <Button type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save new password' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
