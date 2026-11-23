<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  injectDialogRootContext,
  useBodyScrollLock,
} from 'reka-ui'
import { cn } from '@/lib/utils'

// Local mirror of the reka-ui DialogContent props/emits used here —
// type-only imports from reka-ui cannot always be resolved by the SFC
// compiler inside defineProps()/defineEmits() (same as Button.vue).
interface Props {
  as?: string
  asChild?: boolean
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()

// Payload types mirror reka-ui's DialogContent emits: the outside events
// wrap the original DOM event in a CustomEvent (so handlers can call
// preventDefault), and the auto-focus events are plain Events.
type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>
type FocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>

const emit = defineEmits<{
  openAutoFocus: [event: Event]
  closeAutoFocus: [event: Event]
  escapeKeyDown: [event: KeyboardEvent]
  pointerDownOutside: [event: PointerDownOutsideEvent]
  interactOutside: [event: PointerDownOutsideEvent | FocusOutsideEvent]
  focusOutside: [event: FocusOutsideEvent]
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

// iOS pass (2026-11-12, style-guide.md → Sheets): a bottom sheet on
// phones (slide up, grabber, safe-area padding) and a centered zoom
// modal from the `sm` breakpoint up.
//
// The dimming scrim is rendered HERE instead of reka-ui's DialogOverlay:
// in this app the overlay component silently never mounts (its render
// gate on the injected root context never fires — verified in the real
// browser; latent since M2, found in the iOS pass), which also skipped
// DialogOverlayImpl's body scroll lock. Reading the public
// injectDialogRootContext() restores both: the scrim shows exactly while
// the dialog is open, and useBodyScrollLock pins the background.
const rootContext = injectDialogRootContext()
const dialogOpen = computed(() => rootContext.open.value)
// reka's own DialogOverlayImpl pattern: the composable returns a writable
// ref that the caller syncs with the open state.
const scrollLocked = useBodyScrollLock(dialogOpen.value)
watch(dialogOpen, (open) => {
  scrollLocked.value = open
})
</script>

<template>
  <DialogPortal>
    <Transition name="dialog-scrim">
      <!-- pointer-events-auto: the scroll lock sets pointer-events:none on
           <body>; the scrim must keep catching taps so reka-ui's
           pointerDownOutside (tap the dimmed area → close) still fires. -->
      <div
        v-if="dialogOpen"
        class="pointer-events-auto fixed inset-0 z-50 bg-black/50"
        aria-hidden="true"
      />
    </Transition>
    <DialogContent
      v-bind="delegatedProps"
      :class="
        cn(
          // v2-13 liquid glass: the sheet is the .glass-blur material —
          // the page content dims and melts behind the frosted panel
          // (blur + saturation + specular top edge), iOS-sheet anatomy.
          'glass-blur pointer-events-auto fixed z-50 grid gap-4 ease-ios duration-300',
          'inset-x-0 bottom-0 max-h-[88svh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
          'sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100svh-4rem)] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6 sm:duration-200',
          'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0',
          'data-[state=open]:sm:zoom-in-95 data-[state=closed]:sm:zoom-out-95 data-[state=open]:sm:fade-in-0 data-[state=closed]:sm:fade-out-0',
          props.class,
        )
      "
      @open-auto-focus="emit('openAutoFocus', $event)"
      @close-auto-focus="emit('closeAutoFocus', $event)"
      @escape-key-down="emit('escapeKeyDown', $event)"
      @interact-outside="emit('interactOutside', $event)"
      @pointer-down-outside="emit('pointerDownOutside', $event)"
      @focus-outside="emit('focusOutside', $event)"
    >
      <slot name="grabber">
        <div
          class="bg-foreground/15 mx-auto -mt-1 mb-1 h-1.5 w-10 rounded-full sm:hidden"
          aria-hidden="true"
        />
      </slot>
      <slot />

      <DialogClose
        class="ring-offset-background focus:ring-ring absolute right-3.5 top-3.5 grid size-8 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
          class="size-4"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
