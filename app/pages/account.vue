<script setup lang="ts">
/**
 * Protected route: requires a signed-in user and shows their account
 * details. The profile row is fetched through supabase-js, so the query is
 * itself constrained by RLS (profiles: self and co-members only, SPEC §9.3).
 * The display name is editable (FR-AUTH-03) — it is what co-members see on
 * member lists, expenses and map pins.
 */
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Account' })

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'display_name' | 'avatar_url' | 'created_at'
>

const supabase = useSupabase()
const user = useSupabaseUser()

const profile = ref<ProfileRow | null>(null)
const profileLoaded = ref(false)
const signingOut = ref(false)

// Display-name editing (FR-AUTH-03).
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)
const nameError = ref('')
const nameSaved = ref(false)

const displayName = computed(() => {
  const fromProfile = profile.value?.display_name?.trim()
  if (fromProfile) return fromProfile
  const meta = user.value?.user_metadata?.display_name
  if (typeof meta === 'string' && meta.trim()) return meta.trim()
  return user.value?.email?.split('@')[0] ?? 'Traveler'
})

const initial = computed(() => displayName.value.charAt(0).toUpperCase())

const providers = computed(() => {
  const list = user.value?.app_metadata?.providers
  return Array.isArray(list) ? (list as string[]) : []
})

const createdLabel = computed(() => {
  const iso = user.value?.created_at
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
})

onMounted(async () => {
  if (!user.value) return
  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, created_at')
    .eq('id', user.value.id)
    .maybeSingle()
  profile.value = data
  profileLoaded.value = true
})

async function saveDisplayName() {
  const name = nameDraft.value.trim()
  if (!name) {
    nameError.value = 'Please enter a display name.'
    return
  }
  if (name.length > 120) {
    nameError.value = 'Names are limited to 120 characters.'
    return
  }

  savingName.value = true
  nameError.value = ''
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', user.value?.id ?? '')
  savingName.value = false

  if (error) {
    nameError.value = 'Could not save the name. Please try again.'
    return
  }

  if (profile.value) profile.value.display_name = name
  editingName.value = false
  nameSaved.value = true
  setTimeout(() => (nameSaved.value = false), 2500)
}

async function signOut() {
  signingOut.value = true
  await supabase.auth.signOut()
  await navigateTo('/', { replace: true })
}

const rows = computed(() => [
  { label: 'Email', value: user.value?.email ?? '—' },
  { label: 'Sign-in methods', value: providers.value.join(', ') || '—' },
  { label: 'Member since', value: createdLabel.value },
])
</script>

<template>
  <div class="mx-auto w-full max-w-lg px-4 py-12">
    <h1 class="mb-6 text-2xl font-bold tracking-tight">Your account</h1>

    <Card>
      <CardHeader class="items-center text-center">
        <span
          class="bg-primary text-primary-foreground flex size-16 items-center justify-center rounded-full text-2xl font-semibold shadow-[inset_0_1px_0_0_var(--btn-sheen)]"
          aria-hidden="true"
        >
          {{ initial }}
        </span>
        <CardTitle class="mt-2">{{ displayName }}</CardTitle>
        <CardDescription>Signed in to Pasyal</CardDescription>
      </CardHeader>

      <CardContent>
        <!-- Display name (FR-AUTH-03) -->
        <div class="mb-4">
          <div v-if="!editingName" class="flex items-center justify-between gap-3">
            <div>
              <p class="text-muted-foreground text-xs uppercase tracking-wide">Display name</p>
              <p class="text-sm font-medium">{{ displayName }}</p>
              <p v-if="nameSaved" class="text-primary mt-1 text-xs" role="status">Name saved.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="((editingName = true), (nameDraft = displayName), (nameError = ''))"
            >
              Change
            </Button>
          </div>
          <form v-else class="grid gap-3" @submit.prevent="saveDisplayName">
            <div class="grid gap-2">
              <Label for="display-name-input">Display name</Label>
              <Input
                id="display-name-input"
                v-model="nameDraft"
                placeholder="Ana"
                maxlength="120"
                required
              />
              <p class="text-muted-foreground text-xs">Shown on member lists, expenses and map pins.</p>
            </div>
            <p v-if="nameError" class="text-destructive text-sm" role="alert">{{ nameError }}</p>
            <div class="flex gap-2">
              <Button type="submit" size="sm" :disabled="savingName">
                {{ savingName ? 'Saving…' : 'Save' }}
              </Button>
              <Button type="button" variant="ghost" size="sm" @click="editingName = false">
                Cancel
              </Button>
            </div>
          </form>
        </div>

        <dl class="divide-y divide-border/60 rounded-xl border border-border/70 bg-card/40">
          <div
            v-for="row in rows"
            :key="row.label"
            class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <dt class="text-muted-foreground text-sm">{{ row.label }}</dt>
            <dd class="text-sm font-medium break-all">{{ row.value }}</dd>
          </div>
        </dl>

        <p v-if="profileLoaded && !profile" class="text-muted-foreground mt-3 text-xs">
          No profile row was returned — this can happen right after sign-up if the database
          migration has not been applied yet (see README → Database).
        </p>
      </CardContent>

      <CardFooter class="justify-end">
        <Button variant="outline" :disabled="signingOut" @click="signOut">
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
