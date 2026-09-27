import { describe, expect, it } from 'vitest';

import { DEMOS } from './demos';

describe('DEMOS', () => {
  it('has unique slugs', () => {
    const slugs = DEMOS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('links every demo over https', () => {
    for (const d of DEMOS) expect(d.url).toMatch(/^https:\/\//);
  });

  it('lists the three site-engine outreach previews', () => {
    const urls = DEMOS.map((d) => d.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://hirobius-pnw-arborist.vercel.app',
        'https://hirobius-duran-tree-service.vercel.app',
        'https://hirobius-septic-response.vercel.app',
      ]),
    );
  });
});
