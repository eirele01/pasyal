import { cva, type VariantProps } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  // v2-13 liquid glass: badges are pills of the same material family —
  // default is saturated tinted glass with the button sheen, secondary
  // and outline sit on translucent glass with the specular top edge,
  // so status pills on cards and rows match every other control.
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums [&>svg]:pointer-events-none [&>svg]:size-3 transition-[color,box-shadow]',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_var(--btn-sheen)] [a&]:hover:bg-primary/90',
        secondary:
          'border-border/60 bg-secondary/85 text-secondary-foreground shadow-[inset_0_1px_0_0_var(--glass-highlight)] [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white shadow-[inset_0_1px_0_0_var(--btn-sheen)] [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border-border/80 bg-card/50 text-foreground shadow-[inset_0_1px_0_0_var(--glass-highlight)] backdrop-blur-sm [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
