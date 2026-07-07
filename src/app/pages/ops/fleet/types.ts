/**
 * Types for the /ops Fleet board. Mirrors the GET /api/projects response
 * (lib/fleet-status.mjs), which aggregates each fleet repo's root status.json
 * live from the GitHub Contents API.
 */

export interface FleetStatus {
  updatedAt: string | null;
  phase: string | null;
  /** false when `phase` is present but not one of the recognized values. */
  phaseKnown: boolean;
  headline: string;
  next: string[];
  blocked: string[];
}

export interface FleetProject {
  owner: string;
  repo: string;
  label: string;
  ref: string | null;
  htmlUrl: string;
  ok: boolean;
  status?: FleetStatus;
  error?: string;
}

export interface FleetResponse {
  generatedAt: string;
  projects: FleetProject[];
}
