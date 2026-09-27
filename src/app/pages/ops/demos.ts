/**
 * Committed showcase of sample / demo builds — concept sites Hirobius has built
 * that are NOT tied to a real client (so, unlike `clients/*`, they carry no PII
 * and live in the repo). Rendered in the clients gallery "Samples & demos"
 * section. Add an entry per published demo.
 *
 * @category Internal
 */

export interface DemoBuild {
  slug: string;
  name: string;
  vertical: string;
  /** Live demo URL (published artifact or preview deployment). */
  url: string;
  services?: string[];
  note?: string;
}

export const DEMOS: readonly DemoBuild[] = [
  {
    slug: 'meridian-real-estate',
    name: 'Meridian — Modern Real Estate',
    vertical: 'Real estate',
    url: 'https://claude.ai/artifact/Rph5cMYtqscoH32q6cGYj5',
    services: ['website', 'design'],
    note: 'Modern real-estate concept.',
  },
  {
    slug: 'ironridge-real-estate',
    name: 'IRONRIDGE — Residential Real Estate',
    vertical: 'Real estate',
    url: 'https://claude.ai/artifact/LmaFpnoyvZa1CNDp92Bi2D',
    services: ['website', 'design'],
    note: 'Residential real-estate concept.',
  },
  {
    slug: 'preview-arborist',
    name: 'Arborist — outreach preview',
    vertical: 'Tree care',
    url: 'https://hirobius-pnw-arborist.vercel.app',
    services: ['website'],
    note: 'Cold-outreach preview (site-engine apps/pnw-arborist). Basic-auth gated; placeholder contact details.',
  },
  {
    slug: 'preview-tree-service',
    name: 'Tree service — outreach preview',
    vertical: 'Tree care',
    url: 'https://hirobius-duran-tree-service.vercel.app',
    services: ['website'],
    note: 'Cold-outreach preview (site-engine apps/duran-tree-service). Basic-auth gated; placeholder contact details.',
  },
  {
    slug: 'preview-septic',
    name: 'Septic — outreach preview',
    vertical: 'Septic service',
    url: 'https://hirobius-septic-response.vercel.app',
    services: ['website'],
    note: 'Cold-outreach preview (site-engine apps/septic-response). Basic-auth gated; placeholder contact details.',
  },
] as const;
