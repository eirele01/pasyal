<script setup lang="ts">
/**
 * Join trip via invite link (UI-04).
 *
 * FR-AUTH-07: unauthenticated visitors are routed through sign-in with a
 * redirect that preserves this URL, then land back here. FR-MEM-01: the
 * screen shows the trip name and a Join action before joining.
 * FR-MEM-04: unclaimed guests can be claimed so recorded history carries
 * over to the real account.
 */
import { CAN_JOIN_MESSAGES, formatDateRange } from '~/lib/trips'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()
const code = route.params.code as string

useSeoMeta({ title: 'Join trip' })

type Preview = Database['public']['Functions']['get_invite_preview']['Returns'][number]

const preview = ref<Preview | null>(null)
const loading = ref(true)
const joining = ref(false)
const errorMessage = ref('')
const resent = ref(false)
const resending = ref(false)

// Which guest row to claim (null = join as a fresh member).
const claimMemberId = ref<string | null>(null)

async function load() {
  loading.value = true
  const { data, error } = await supabase.rpc('get_invite_preview', { p_code: code })
  loading.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }
  // No rows → the code is unknown or was regenerated (FR-MEM-02).
  preview.value = data && data.length > 0 ? (data[0] ?? null) : null
}

onMounted(load)

async function join() {
  joining.value = true
  errorMessage.value = ''
  const { data: tripId, error } = await supabase.rpc('join_trip_by_invite', {
    p_code: code,
    ...(claimMemberId.value ? { p_claim_member_id: claimMemberId.value } : {}),
  })
  joining.value = false

  if (error || !tripId) {
    errorMessage.value = error?.message ?? 'Could not join the trip. Please try again.'
    await load() // can_join state may have changed (full, archived…)
    return
  }

  await navigateTo(`/trips/${tripId}`, { replace: true })
}

/** FR-AUTH-09 helper: let an unverified user resend the confirmation email. */
async function resendConfirmation() {
  if (!user.value?.email) return
  resending.value = true
  const { error } = await supabase.auth.resend({ type: 'signup', email: user.value.email })
  resending.value = false
  if (!error) {
    resent.value = true
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
    <!-- Loading -->
    <div v-if="loading" class="text-muted-foreground py-16 text-center text-sm">
      Opening the invite…
    </div>

    <!-- Invalid / regenerated code (FR-MEM-02) -->
    <Card v-else-if="!preview">
      <CardHeader class="text-center">
        <CardTitle>This invite link is not valid anymore</CardTitle>
        <CardDescription>
          The owner may have regenerated the link, or the trip is gone. Ask them to share the
          current one.
        </CardDescription>
      </CardHeader>
      <CardFooter class="justify-center">
        <Button variant="outline" as-child>
          <NuxtLink to="/trips">Back to your trips</NuxtLink>
        </Button>
      </CardFooter>
    </Card>

    <template v-else>
      <Card>
        <CardHeader class="text-center">
          <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            You're invited to
          </p>
          <CardTitle class="text-xl">{{ preview.name }}</CardTitle>
          <CardDescription>
            {{ formatDateRange(preview.start_date, preview.end_date) }} · hosted by
            {{ preview.owner_name }} ·
            {{ preview.member_count }} {{ preview.member_count === 1 ? 'member' : 'members' }}
          </CardDescription>
        </CardHeader>

        <CardContent class="grid gap-4">
          <!-- Joinable -->
          <template v-if="preview.can_join === 'ok'">
            <!-- Guest claim options (FR-MEM-04) -->
            <fieldset v-if="preview.guests_unclaimed.length > 0" class="grid gap-2">
              <legend class="text-sm font-medium">
                Already recorded on this trip as a guest?
              </legend>
              <label
                v-for="guest in preview.guests_unclaimed"
                :key="guest.member_id"
                class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  v-model="claimMemberId"
                  type="radio"
                  name="claim-guest"
                  :value="guest.member_id"
                  class="accent-primary size-4"
                />
                <span>
                  Continue as <strong>{{ guest.display_name }}</strong>
                  <span class="text-muted-foreground block text-xs">
                    Keeps everything recorded under this name so far
                  </span>
                </span>
              </label>
              <label
                class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  v-model="claimMemberId"
                  type="radio"
                  name="claim-guest"
                  :value="null"
                  class="accent-primary size-4"
                />
                <span>Join as a new member</span>
              </label>
            </fieldset>

            <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
              {{ errorMessage }}
            </p>

            <Button size="lg" :disabled="joining" @click="join">
              {{ joining ? 'Joining…' : `Join ${preview.name}` }}
            </Button>
          </template>

          <!-- Already a member (FR-MEM-01) -->
          <template v-else-if="preview.can_join === 'already_member'">
            <p class="text-muted-foreground text-sm">You're already on this trip.</p>
            <Button as-child>
              <NuxtLink :to="`/trips/${preview.trip_id}`">Open the trip</NuxtLink>
            </Button>
          </template>

          <!-- Unverified email (FR-AUTH-09) -->
          <template v-else-if="preview.can_join === 'unverified_email'">
            <p class="text-muted-foreground text-sm leading-relaxed">
              {{ CAN_JOIN_MESSAGES.unverified_email }}
              Check your inbox for the confirmation link, then come back here.
            </p>
            <p v-if="resent" class="text-primary text-sm" role="status">
              Confirmation email sent again.
            </p>
            <Button variant="outline" :disabled="resending || resent" @click="resendConfirmation">
              {{ resending ? 'Sending…' : 'Resend confirmation email' }}
            </Button>
          </template>

          <!-- Archived / full (BR-03, FR-MEM-08) -->
          <p v-else class="text-muted-foreground text-sm" role="status">
            {{ CAN_JOIN_MESSAGES[preview.can_join] }}
          </p>
        </CardContent>
      </Card>

      <p class="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
        Location sharing is opt-in, off by default, and only works while
        the app is open.
      </p>
    </template>
  </div>
</template>
