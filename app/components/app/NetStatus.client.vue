<script setup lang="ts">
/**
 * Network + sync status (M5, FR-PWA-04/05/06, SPEC §5.10, §10.2).
 *
 * Mounted once in the app header (client-only):
 *   * owns the shared online state (navigator.onLine + events);
 *   * initializes the offline queue and triggers flushes;
 *   * shows the persistent Offline badge and the "N changes queued"
 *     indicator — pending and error states are never silent (§10.2);
 *   * renders the new-version banner from the service worker lifecycle
 *     (FR-PWA-05, via the @vite-pwa/nuxt module's $pwa).
 */
const online = useOnline()
const { entries, syncing, summary, init, discard, retryFailed } = useOfflineQueue()
const pwa = useNuxtApp().$pwa as
  | {
      needRefresh: boolean
      offlineReady: boolean
      updateServiceWorker(reloadPage?: boolean): Promise<void>
      cancelPrompt(): Promise<void>
      isInstalled: boolean
      showInstallPrompt: boolean
      install(): Promise<void>
    }
  | undefined

const panelOpen = ref(false)

onMounted(() => {
  online.value = navigator.onLine
  window.addEventListener('online', () => {
    online.value = true
  })
  window.addEventListener('offline', () => {
    online.value = false
  })
  init()
})

function entryLabel(entry: { op: { kind: string } & Record<string, unknown> }): string {
  const op = entry.op
  if (op.kind === 'expense-save') {
    const display = op.display as { title: string }
    const isEdit = Boolean((op.rpcParams as { p_expense_id?: string | null }).p_expense_id)
    return `${isEdit ? 'Edit expense' : 'Expense'}: ${display.title}`
  }
  if (op.kind === 'item-insert') return `Itinerary item: ${(op.row as { title: string }).title}`
  return 'Itinerary edit'
}
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- ── Offline badge (FR-PWA-06: visible in the header) ─────────── -->
    <span
      v-if="!online"
      data-testid="offline-badge"
      class="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900"
      role="status"
    >
      <span class="inline-block size-2 rounded-full bg-amber-500" aria-hidden="true" />
      Offline
    </span>

    <!-- ── Queued changes (FR-PWA-04: pending + failures visible) ───── -->
    <button
      v-if="summary.total > 0"
      type="button"
      data-testid="queue-indicator"
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      :class="
        summary.failed > 0
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/60 text-muted-foreground'
      "
      :aria-label="`Open pending offline changes (${summary.total} queued${summary.failed ? `, ${summary.failed} failed` : ''})`"
      @click="panelOpen = true"
    >
      <span
        class="inline-block size-2 rounded-full"
        :class="summary.failed > 0 ? 'bg-destructive' : 'animate-pulse bg-primary'"
        aria-hidden="true"
      />
      {{ syncing ? 'Syncing…' : `${summary.total} change${summary.total === 1 ? '' : 's'} queued` }}
      <span v-if="summary.failed > 0">· {{ summary.failed }} failed</span>
    </button>

    <!-- ── New app version banner (FR-PWA-05) ───────────────────────── -->
    <Teleport to="body">
      <div
        v-if="pwa?.needRefresh"
        data-testid="update-banner"
        class="bg-primary text-primary-foreground fixed inset-x-0 top-14 z-[90] mx-auto flex w-fit max-w-[94vw] items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg"
        role="status"
      >
        A new version of Pasyal is available.
        <button
          type="button"
          class="bg-primary-foreground/15 rounded-full px-3 py-1 font-semibold underline-offset-2 hover:underline"
          data-testid="update-reload"
          @click="pwa?.updateServiceWorker(true)"
        >
          Reload
        </button>
        <button
          type="button"
          class="text-primary-foreground/80 rounded-full px-2 py-1 hover:underline"
          @click="pwa?.cancelPrompt()"
        >
          Later
        </button>
      </div>
    </Teleport>

    <!-- ── Pending changes panel ────────────────────────────────────── -->
    <Dialog v-model:open="panelOpen">
      <DialogContent>
        <div class="grid gap-4" data-testid="queue-panel">
          <DialogHeader>
            <DialogTitle>Offline changes</DialogTitle>
            <DialogDescription>
              Saved on this device. They sync automatically when you're back online — queued
              changes are visible to you only until then.
            </DialogDescription>
          </DialogHeader>

          <ul class="grid max-h-72 gap-2 overflow-y-auto">
            <li
              v-for="entry in entries"
              :key="entry.id"
              class="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ entryLabel(entry) }}</p>
                <p class="text-muted-foreground text-xs">
                  {{ new Date(entry.createdAt).toLocaleString() }}
                  · attempt{{ entry.attempts === 1 ? '' : 's' }}: {{ entry.attempts }}
                </p>
                <p v-if="entry.lastError" class="text-destructive mt-1 text-xs" role="alert">
                  {{ entry.lastError }}
                </p>
              </div>
              <Button size="sm" variant="ghost" class="text-muted-foreground shrink-0" @click="discard(entry.id)">
                Discard
              </Button>
            </li>
          </ul>

          <DialogFooter>
            <Button v-if="summary.failed > 0" size="sm" variant="outline" @click="retryFailed">
              Retry failed
            </Button>
            <Button size="sm" @click="panelOpen = false">Close</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
