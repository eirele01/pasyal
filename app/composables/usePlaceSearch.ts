import type { PlaceSuggestion } from '~/types/database.types'

/**
 * Place search (FR-MAP-03): debounced autocomplete against the
 * /api/places/search proxy, with a client-side session cache so repeated
 * queries never leave the browser.
 *
 * - debounce: 300 ms after the last keystroke (FR-MAP-03 "requests are
 *   debounced");
 * - cache: identical queries within the session reuse the earlier result;
 * - abort: a newer keystroke cancels the in-flight request;
 * - graceful degradation (NFR-REL-02): errors surface as a plain message
 *   and the form still accepts a manual pin from the map.
 */
export function usePlaceSearch() {
  const query = ref('')
  const suggestions = ref<PlaceSuggestion[]>([])
  const searching = ref(false)
  const searchError = ref('')

  const cache = new Map<string, PlaceSuggestion[]>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null

  async function runSearch() {
    const q = query.value.trim()
    if (q.length < 2) {
      suggestions.value = []
      searchError.value = ''
      return
    }

    const key = q.toLowerCase()
    const hit = cache.get(key)
    if (hit) {
      suggestions.value = hit
      searchError.value = ''
      return
    }

    controller?.abort()
    controller = new AbortController()
    searching.value = true
    searchError.value = ''

    try {
      const res = await fetch(`/api/places/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      const body = (await res.json().catch(() => ({}))) as {
        results?: PlaceSuggestion[]
        statusMessage?: string
        message?: string
      }
      if (!res.ok) {
        suggestions.value = []
        const msg = body.statusMessage ?? body.message ?? ''
        searchError.value = msg.trim()
          ? msg
          : 'Place search is unavailable right now. You can still drop a pin on the map.'
        return
      }
      cache.set(key, body.results ?? [])
      // Only apply if the query has not moved on while awaiting.
      if (query.value.trim().toLowerCase() === key) {
        suggestions.value = body.results ?? []
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        suggestions.value = []
        searchError.value = 'Place search is unavailable right now. You can still drop a pin.'
      }
    } finally {
      searching.value = false
    }
  }

  watch(query, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(runSearch, 300)
  })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    controller?.abort()
  })

  return { query, suggestions, searching, searchError, runSearch }
}
