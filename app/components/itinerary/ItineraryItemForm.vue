<script setup lang="ts">
/**
 * ItineraryItemForm (UI-11): add / edit an itinerary item.
 *
 * Fields per FR-ITN-02: title, optional description, optional start/end
 * time, optional location. The location is chosen by place search OR by
 * dropping a pin on the embedded map (FR-ITN-03) — both store coordinates
 * plus a display name. FR-ITN-11 adds the optional booking link and
 * category. The day select moves the item between days (FR-ITN-04).
 *
 * Validation mirrors the database rules client-side (NFR-SEC-06): title
 * length, time ordering, coordinate pairing/ranges, http(s) URL.
 */
import {
  ITEM_CATEGORIES,
  buildGeoLinks,
  normalizeTime,
  validateItemInput,
} from '~/lib/itinerary'
import type { ItineraryDay, ItemWithEditor } from '~/types/database.types'

const props = defineProps<{
  days: ItineraryDay[]
  /** Present when editing an existing item (FR-ITN-06 last write wins). */
  item?: ItemWithEditor | null
  /** Day the form was opened from (defaults when adding). */
  initialDayId: string
}>()

const emit = defineEmits<{
  (e: 'save', payload: {
    day_id: string
    title: string
    description: string | null
    start_time: string | null
    end_time: string | null
    place_name: string | null
    address: string | null
    lat: number | null
    lng: number | null
    external_url: string | null
    category: string | null
  }): void
  (e: 'cancel'): void
}>()

// ── Form state ─────────────────────────────────────────────────────────
const dayId = ref(props.item?.day_id ?? props.initialDayId)
const title = ref(props.item?.title ?? '')
const description = ref(props.item?.description ?? '')
const startTime = ref(props.item?.start_time?.slice(0, 5) ?? '')
const endTime = ref(props.item?.end_time?.slice(0, 5) ?? '')
const placeName = ref(props.item?.place_name ?? '')
const address = ref(props.item?.address ?? '')
const lat = ref<number | null>(props.item?.lat ?? null)
const lng = ref<number | null>(props.item?.lng ?? null)
const externalUrl = ref(props.item?.external_url ?? '')
const category = ref(props.item?.category ?? '')
const error = ref('')
const saving = ref(false)
const showMap = ref(Boolean(props.item?.lat))

// ── Place search (FR-MAP-03) ───────────────────────────────────────────
const { query, suggestions, searching, searchError } = usePlaceSearch()
const openSuggestion = ref<number | null>(null)
const listbox = ref<HTMLUListElement | null>(null)

// v2-4 fix: open the suggestion list the moment results arrive. Before,
// the list only opened on the field's @focus — and at first focus there
// are no suggestions yet, so the first search's results stayed hidden
// until the user focused another field and came back.
watch(suggestions, (list) => {
  openSuggestion.value = list.length > 0 ? 0 : null
})

// v2-4 fix, second half: on phones the Location field sits near the
// bottom of the scrollable bottom-sheet dialog, so the list would open
// below the visible area. Scroll the freshly opened list into view
// inside the dialog (the input stays right above it).
watch(openSuggestion, async (open) => {
  if (open === null) return
  await nextTick()
  listbox.value?.scrollIntoView({ block: 'nearest' })
})

function chooseSuggestion(index: number) {
  const s = suggestions.value[index]
  if (!s) return
  placeName.value = s.name
  address.value = s.address
  lat.value = s.lat
  lng.value = s.lng
  openSuggestion.value = null
  showMap.value = true
}

function onPick(latlng: number, lngVal: number) {
  lat.value = latlng
  lng.value = lngVal
  if (!placeName.value.trim()) placeName.value = 'Pinned location'
}

function clearLocation() {
  placeName.value = ''
  address.value = ''
  lat.value = null
  lng.value = null
}

// ── Save ───────────────────────────────────────────────────────────────
function submit() {
  const invalid = validateItemInput({
    title: title.value,
    start_time: normalizeTime(startTime.value),
    end_time: normalizeTime(endTime.value),
    lat: lat.value,
    lng: lng.value,
    external_url: externalUrl.value.trim() ? externalUrl.value.trim() : null,
  })
  if (invalid) {
    error.value = invalid
    return
  }
  error.value = ''
  saving.value = true
  emit('save', {
    day_id: dayId.value,
    title: title.value.trim(),
    description: description.value.trim() ? description.value : null,
    start_time: normalizeTime(startTime.value),
    end_time: normalizeTime(endTime.value),
    place_name: placeName.value.trim() ? placeName.value.trim() : null,
    address: address.value.trim() ? address.value.trim() : null,
    lat: lat.value,
    lng: lng.value,
    external_url: externalUrl.value.trim() ? externalUrl.value.trim() : null,
    category: category.value || null,
  })
}

function done() {
  saving.value = false
}

defineExpose({ done })

// Reuse the pure geo-link helper for the "preview" link under the map.
const previewLink = computed(() =>
  lat.value !== null && lng.value !== null ? buildGeoLinks(lat.value, lng.value).webUrl : '',
)
</script>

<template>
  <form class="grid gap-4" @submit.prevent="submit">
    <div class="grid gap-2">
      <Label for="item-title">Title</Label>
      <Input id="item-title" v-model="title" maxlength="200" required placeholder="Island hopping Tour A" />
    </div>

    <div class="grid gap-2">
      <Label for="item-day">Day</Label>
      <select
        id="item-day"
        v-model="dayId"
        class="field h-9 px-3"
      >
        <option v-for="d in days" :key="d.id" :value="d.id">
          Day {{ d.day_index + 1 }} · {{ d.date }}
        </option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="grid gap-2">
        <Label for="item-start">Start time</Label>
        <Input id="item-start" v-model="startTime" type="time" />
      </div>
      <div class="grid gap-2">
        <Label for="item-end">End time</Label>
        <Input id="item-end" v-model="endTime" type="time" />
      </div>
    </div>

    <div class="grid gap-2">
      <Label for="item-description">Description <span class="text-muted-foreground">(optional)</span></Label>
      <Textarea id="item-description" v-model="description" rows="2" maxlength="2000" placeholder="Bring sunscreen" />
    </div>

    <div class="grid gap-2">
      <Label for="item-category">Category</Label>
      <select
        id="item-category"
        v-model="category"
        class="field h-9 px-3"
      >
        <option v-for="c in ITEM_CATEGORIES" :key="c.value" :value="c.value">
          {{ c.icon }} {{ c.label }}
        </option>
      </select>
    </div>

    <div class="grid gap-2">
      <Label for="item-url">Booking link <span class="text-muted-foreground">(optional)</span></Label>
      <Input id="item-url" v-model="externalUrl" type="url" placeholder="https://…" />
    </div>

    <!-- Location: place search or dropped pin (FR-ITN-03) -->
    <div class="grid gap-2">
      <Label for="item-place">Location <span class="text-muted-foreground">(optional)</span></Label>
      <div class="relative">
        <Input
          id="item-place"
          v-model="query"
          autocomplete="off"
          placeholder="Search a place…"
          @keydown.escape="openSuggestion = null"
          @focus="openSuggestion = suggestions.length ? 0 : null"
        />
        <p v-if="searching" class="text-muted-foreground mt-1 text-xs">Searching…</p>
        <p v-if="searchError" class="text-destructive mt-1 text-xs" role="alert">{{ searchError }}</p>
        <ul
          v-if="openSuggestion !== null && suggestions.length"
          ref="listbox"
          class="glass-blur absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl"
          role="listbox"
        >
          <li
            v-for="(s, i) in suggestions"
            :key="s.id"
            class="hover:bg-muted cursor-pointer px-3 py-2 text-sm"
            role="option"
            :aria-selected="i === openSuggestion"
            @click="chooseSuggestion(i)"
            @keydown.enter.prevent="chooseSuggestion(i)"
          >
            <span class="block font-medium">{{ s.name }}</span>
            <span class="text-muted-foreground block truncate text-xs">{{ s.address }}</span>
          </li>
        </ul>
      </div>

      <p v-if="placeName" class="text-sm">
        <span class="font-medium">{{ placeName }}</span>
        <span v-if="address" class="text-muted-foreground"> — {{ address }}</span>
        <span v-if="lat !== null && lng !== null" class="text-muted-foreground text-xs">
          ({{ lat.toFixed(4) }}, {{ lng.toFixed(4) }})</span
        >
      </p>

      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" @click="showMap = !showMap">
          {{ showMap ? 'Hide map' : 'Drop a pin on the map' }}
        </Button>
        <Button
          v-if="placeName || lat !== null"
          type="button"
          variant="outline"
          size="sm"
          @click="clearLocation"
        >
          Clear location
        </Button>
        <a
          v-if="previewLink"
          :href="previewLink"
          target="_blank"
          rel="noopener"
          class="text-primary inline-flex items-center text-sm underline"
        >
          Preview in maps
        </a>
      </div>

      <div v-if="showMap" class="h-64 overflow-hidden rounded-xl border">
        <TripMap
          :markers="[]"
          :pick-mode="true"
          :picked="lat !== null && lng !== null ? { lat, lng } : null"
          @pick="onPick"
        />
      </div>
    </div>

    <p v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</p>

    <DialogFooter>
      <Button type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving">
        {{ saving ? 'Saving…' : item ? 'Save changes' : 'Add to itinerary' }}
      </Button>
    </DialogFooter>
  </form>
</template>
