/**
 * Promotion queue for /ops/staging — localStorage-backed list of specimens
 * the operator wants to ingest into HDS. Schema-agnostic: the export-JSON
 * action dumps the queue verbatim; the operator pastes it wherever the
 * eventual build agent reads from (proposed-units.jsonl, a build-agent
 * prompt, a dedicated promotion file, etc.).
 *
 * Queue is local-only — never sent to a server, no network — so it survives
 * refreshes but stays per-browser.
 */

import type { SpecimenFamily } from './types';

const STORAGE_KEY = 'ops.staging.promotion-queue';

export type SuggestedTier = 'primitive' | 'pattern' | 'template';

export interface PromotionEntry {
  /** Generated unique id for this queue entry (not the specimen id). */
  id:             string;
  /** ISO timestamp the specimen was queued. */
  ts:             string;
  /** Source specimen id — for traceability. */
  sourceSpecimen: string;
  /** Specimen-derived defaults (carried for the build agent). */
  family:         SpecimenFamily;
  source:         string;
  tags:           string[];
  /** Operator-supplied promotion intent. */
  hdsName:        string;
  suggestedTier:  SuggestedTier;
  description:    string;
  notes:          string;
}

export function loadQueue(): PromotionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PromotionEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue: PromotionEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage unavailable — silent fall-through. */
  }
}

export function addToQueue(entry: PromotionEntry): PromotionEntry[] {
  const next = [...loadQueue(), entry];
  saveQueue(next);
  return next;
}

export function removeFromQueue(entryId: string): PromotionEntry[] {
  const next = loadQueue().filter((e) => e.id !== entryId);
  saveQueue(next);
  return next;
}

export function clearQueue(): void {
  saveQueue([]);
}

export function newEntryId(): string {
  // crypto.randomUUID() exists in modern browsers; fall back to ts+rand.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function copyQueueAsJson(queue: PromotionEntry[]): Promise<boolean> {
  const blob = JSON.stringify(queue, null, 2);
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(blob);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
