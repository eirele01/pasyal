import { cva, type VariantProps } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  // iOS pass (2026-11-12, style-guide.md): pill buttons, a physical
  // 0.97 press scale with iOS easing, and no text selection on tap.
  // v2-13 liquid glass: the pill stays; every variant is now a glass
  // material — primary/destructive are saturated tinted glass with a
  // specular top edge (--btn-sheen), outline/secondary are the shared
  // .glass-btn material, so every control on every page reads as the
  // same design system.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 ease-ios select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_var(--btn-sheen),0_1px_3px_rgb(4_47_46/0.25)] hover:bg-primary/90 active:bg-primary/95',
        destructive:
          'bg-destructive text-white shadow-[inset_0_1px_0_0_var(--btn-sheen),0_1px_3px_rgb(69_10_10/0.2)] hover:bg-destructive/90 active:bg-destructive/95 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'glass-btn text-foreground dark:hover:bg-card/90',
        secondary: 'glass-btn text-secondary-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 px-6 text-base has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
