/**
 * Subscribes to Supabase Realtime postgres_changes for the given tables and
 * calls `onChange` whenever a row changes (FR-TRIP-04: edits are visible to
 * all members in real time).
 *
 * - Supabase Realtime checks RLS before delivering an event, so members only
 *   ever receive changes for trips they belong to (NFR-SEC-04).
 * - If realtime is not enabled for a table, the subscription is a no-op and
 *   data still loads through normal queries (NFR-REL-02 graceful fallback).
 * - Client-side only (onMounted/onUnmounted); nothing happens during SSR.
 */
export function useRealtimeTables(
  tables: { table: string; filter?: string }[],
  onChange: () => void,
) {
  const supabase = useSupabase()

  onMounted(() => {
    const channelName = `pasyal-realtime-${Math.random().toString(36).slice(2)}`
    let channel = supabase.channel(channelName)

    for (const t of tables) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: t.table,
          ...(t.filter ? { filter: t.filter } : {}),
        },
        () => onChange(),
      )
    }

    channel.subscribe()
    onUnmounted(() => {
      supabase.removeChannel(channel)
    })
  })
}
