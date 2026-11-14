/**
 * Shared online/offline state (FR-PWA-06, SPEC §5.10).
 *
 * The state is initialized and kept in sync by the NetStatus client
 * component mounted in the app header (single owner); everything else
 * just reads it. `true` is the SSR-safe default — a false negative only
 * ever costs one failed request that then lands in the offline queue.
 */
export function useOnline() {
  return useState<boolean>('pasyal:online', () => true)
}
