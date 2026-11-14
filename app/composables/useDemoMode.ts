/**
 * Demo mode flag (FR-LOC-15): simulated members walk a predefined route on
 * the trip map, clearly labelled "Demo", and are never written to trip
 * data — the simulator is pure client-side geometry (app/lib/location.ts).
 *
 * The toggle lives in Settings (UI-16, partial — the rest of that screen
 * arrives with M6/M7); the map page renders the pins. The preference is
 * remembered in localStorage.
 */
export function useDemoMode() {
  const demoOn = useState('pasyal:demo-mode', () => {
    if (import.meta.client) {
      try {
        return window.localStorage.getItem('pasyal:demo-mode') === 'on'
      } catch {
        return false
      }
    }
    return false
  })

  function setDemo(on: boolean) {
    demoOn.value = on
    if (import.meta.client) {
      try {
        window.localStorage.setItem('pasyal:demo-mode', on ? 'on' : 'off')
      } catch {
        // Private-browsing storage: the toggle still works for this visit.
      }
    }
  }

  return { demoOn, setDemo }
}
