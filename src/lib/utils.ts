/**
 * cn — className combiner (clsx + tailwind-merge).
 * @internal — ops-local helper. Mirrors `@hirobius/design-system/cn` so the
 * absorbed ops components (approval-card, phase-header) don't depend on the
 * package's `cn` subpath. Backs package.json's `./cn` export map.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
