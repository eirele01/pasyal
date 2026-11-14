import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 * Standard shadcn-vue helper (docs/SPEC.md §1.5: Tailwind CSS + shadcn-vue).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
