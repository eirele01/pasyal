<script setup lang="ts">
/**
 * Members tab (UI-14) — the M1 trip overview content, now a tab of the
 * trip home (UI-05). Invite link (FR-MEM-01/02), guest add (FR-MEM-03),
 * owner removal and member leave with balance confirmations
 * (FR-MEM-05/06), roles and sharing status (FR-MEM-09).
 */
import { buildInviteUrl, initialOf, roleLabel } from '~/lib/trips'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()
const tripId = route.params.id as string

const { trip, members, load, isOwner, isArchived, myMembership } = useTripData(tripId)

useSeoMeta({ title: 'Members' })

const actionError = ref('')
const actionNotice = ref('')

// ── Invite link (FR-MEM-01/02) ────────────────────────────────────────
const copied = ref(false)
const regenOpen = ref(false)
const regenerating = ref(false)

// ── Guest add (FR-MEM-03) ─────────────────────────────────────────────
const guestName = ref('')
const addingGuest = ref(false)

// ── Remove member / leave with balance confirmation (FR-MEM-05/06) ────
type MemberRow = (typeof members.value)[number]
const removeTarget = ref<MemberRow | null>(null)
const removeForceTarget = ref<MemberRow | null>(null)
const removing = ref(false)
const leaveForceOpen = ref(false)
const leaving = ref(false)

const inviteUrl = computed(() =>
  trip.value ? buildInviteUrl(trip.value.invite_code, window.location.origin) : '',
)

onMounted(() => {
  if (!trip.value) load()
})

// Member changes stream in through the wrapper's subscription; refresh
// locally too so direct navigation stays live.
useRealtimeTables([{ table: 'trip_members', filter: `trip_id=eq.${tripId}` }], () => {
  load()
})

// ── Invite link (FR-MEM-01, EI-08 pattern: feature-detect clipboard) ──
async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    actionNotice.value = 'Copy the link from the field below.'
  }
}

// ── Owner: regenerate invite code (FR-MEM-02) ─────────────────────────
async function regenerateInvite() {
  regenerating.value = true
  const { error } = await supabase.rpc('regenerate_invite_code', { p_trip_id: tripId })
  regenerating.value = false
  regenOpen.value = false
  if (error) {
    actionError.value = error.message
    return
  }
  actionNotice.value = 'New invite link created. The old one no longer works.'
  copied.value = false
  await load()
}

// ── Owner: add guest by name (FR-MEM-03) ──────────────────────────────
async function addGuest() {
  const name = guestName.value.trim()
  if (!name) {
    actionError.value = 'Please enter a name for the guest.'
    return
  }
  if (name.length > 120) {
    actionError.value = 'Names are limited to 120 characters.'
    return
  }

  addingGuest.value = true
  const { error } = await supabase
    .from('trip_members')
    .insert({ trip_id: tripId, display_name: name, role: 'guest' })
  addingGuest.value = false

  if (error) {
    // The 20-member cap trigger message surfaces here (FR-MEM-08).
    actionError.value = error.message
    return
  }
  actionError.value = ''
  guestName.value = ''
  await load()
}

// ── Owner: remove member (FR-MEM-05, BR-06) ───────────────────────────
async function removeMember(member: MemberRow, force: boolean) {
  removing.value = true
  const { error } = await supabase.rpc('remove_trip_member', {
    p_member_id: member.id,
    p_force: force,
  })
  removing.value = false
  removeTarget.value = null
  removeForceTarget.value = null

  if (error) {
    if (!force && error.message.includes('non-zero balance')) {
      removeForceTarget.value = member
      return
    }
    actionError.value = error.message
    return
  }
  actionError.value = ''
  await load()
}

// ── Member: leave (FR-MEM-06) ─────────────────────────────────────────
async function leave(force: boolean) {
  leaving.value = true
  const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId, p_force: force })
  leaving.value = false
  leaveForceOpen.value = false

  if (error) {
    if (!force && error.message.includes('non-zero balance')) {
      leaveForceOpen.value = true
      return
    }
    actionError.value = error.message
    return
  }
  await navigateTo('/trips', { replace: true })
}
</script>

<template>
  <div class="grid gap-6">
    <p v-if="actionError" class="text-destructive text-sm" role="alert">{{ actionError }}</p>
    <p v-if="actionNotice" class="text-primary text-sm" role="status">{{ actionNotice }}</p>

    <!-- ── Invite link (FR-MEM-01/02) ───────────────────────────────── -->
    <Card v-if="!isArchived" data-tour="invite-card">
      <CardHeader>
        <CardTitle class="text-base">Invite link</CardTitle>
        <CardDescription>
          Anyone who opens this link and signs in can join the trip (up to 20 members).
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <div class="flex gap-2">
          <Input :model-value="inviteUrl" readonly aria-label="Invite link" class="font-mono text-xs" />
          <Button variant="outline" class="shrink-0" @click="copyInviteLink">
            {{ copied ? 'Copied!' : 'Copy' }}
          </Button>
        </div>
        <Button
          v-if="isOwner"
          variant="ghost"
          size="sm"
          class="justify-start px-0 text-muted-foreground"
          @click="regenOpen = true"
        >
          Regenerate link (invalidates the current one)
        </Button>
      </CardContent>
    </Card>

    <!-- ── Members (UI-14, FR-MEM-09) ───────────────────────────────── -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Members</CardTitle>
        <CardDescription>
          Roles and location sharing status. Guests join expenses but never share location.
        </CardDescription>
      </CardHeader>

      <CardContent class="grid gap-3">
        <!-- Owner: add guest (FR-MEM-03) -->
        <form v-if="isOwner && !isArchived" class="flex gap-2" @submit.prevent="addGuest">
          <Input
            v-model="guestName"
            placeholder="Add a guest by name (no account needed)"
            aria-label="Guest name"
            maxlength="120"
          />
          <Button type="submit" variant="outline" class="shrink-0" :disabled="addingGuest">
            {{ addingGuest ? 'Adding…' : 'Add guest' }}
          </Button>
        </form>

        <!-- iOS pass (2026-11-12): inset grouped list on the card. -->
        <ul class="divide-y divide-border/70 rounded-xl border bg-card">
          <li
            v-for="member in members"
            :key="member.id"
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                aria-hidden="true"
              >
                {{ initialOf(member.display_name) }}
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ member.display_name }}
                  <span v-if="member.user_id === user?.id" class="text-muted-foreground font-normal">(you)</span>
                </p>
                <p class="text-muted-foreground text-xs">
                  {{
                    member.role === 'guest'
                      ? 'No location (guest)'
                      : member.sharing_enabled
                        ? 'Sharing location'
                        : 'Sharing off'
                  }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Badge :variant="member.role === 'owner' ? 'default' : member.role === 'guest' ? 'outline' : 'secondary'">
                {{ roleLabel(member.role) }}
              </Badge>
              <Button
                v-if="isOwner && member.role !== 'owner' && !isArchived"
                size="sm"
                variant="ghost"
                class="text-muted-foreground"
                @click="removeTarget = member"
              >
                Remove
              </Button>
            </div>
          </li>
        </ul>

        <!-- Member: leave (FR-MEM-06) -->
        <div v-if="myMembership && myMembership.role !== 'owner' && !isArchived">
          <Button size="sm" variant="outline" :disabled="leaving" @click="leave(false)">
            {{ leaving ? 'Leaving…' : 'Leave trip' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- ── Regenerate invite confirmation (FR-MEM-02) ────────────────── -->
    <Dialog v-model:open="regenOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate the invite link?</DialogTitle>
          <DialogDescription>
            The current link stops working immediately. Share the new link with anyone you still
            want on the trip.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="regenOpen = false">Cancel</Button>
          <Button :disabled="regenerating" @click="regenerateInvite">
            {{ regenerating ? 'Regenerating…' : 'Regenerate link' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Remove member confirmation (FR-MEM-05) ───────────────────── -->
    <Dialog :open="removeTarget !== null" @update:open="(v) => !v && (removeTarget = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {{ removeTarget?.display_name }}?</DialogTitle>
          <DialogDescription>
            They lose access to the trip. If they are part of recorded expenses, their name stays
            so the group's history and balances stay correct.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="removeTarget = null">Cancel</Button>
          <Button :disabled="removing" @click="removeTarget && removeMember(removeTarget, false)">
            {{ removing ? 'Removing…' : 'Remove member' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Remove member WITH balance warning (FR-MEM-05, BR-06) ────── -->
    <Dialog
      :open="removeForceTarget !== null"
      @update:open="(v) => !v && (removeForceTarget = null)"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unresolved balance</DialogTitle>
          <DialogDescription>
            {{ removeForceTarget?.display_name }} still has a non-zero balance in this trip.
            Removing them anyway keeps every recorded expense and settlement, so the numbers stay
            correct — but settling up with them will be up to the group.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="removeForceTarget = null">Keep them on the trip</Button>
          <Button
            variant="destructive"
            :disabled="removing"
            @click="removeForceTarget && removeMember(removeForceTarget, true)"
          >
            {{ removing ? 'Removing…' : 'Remove anyway' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Leave with balance warning (FR-MEM-06) ───────────────────── -->
    <Dialog v-model:open="leaveForceOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You still have a balance here</DialogTitle>
          <DialogDescription>
            Your recorded expenses and settlements stay with the trip so group balances remain
            correct. Leave anyway?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="leaveForceOpen = false">Stay on the trip</Button>
          <Button variant="destructive" :disabled="leaving" @click="leave(true)">
            {{ leaving ? 'Leaving…' : 'Leave anyway' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
