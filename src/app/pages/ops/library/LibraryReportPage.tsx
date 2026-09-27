/* hds-bypass: the legacy-report iframe frame (sizing/border/radius/background)
   has no HDS primitive — Box's `sx` cannot type iframe-only attrs (srcDoc,
   sandbox), and no HDS component wraps an embedded document. Every value is
   still an HDS token or semantic CSS var. Everything else on this page (the
   loading state) now uses HDS `Text`. */

/**
 * LibraryReportPage — `/ops/library/:slug`. Native HDS reports render as
 * components; legacy HTML reports render framed, sandboxed without same-origin
 * access so a report's scripts can never reach the ops session cookie.
 *
 * @category Internal
 * @tier utility
 */

import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import type { CSSProperties } from 'react';

import { Callout, Page, Stack, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import BuildVsBuyReport from './BuildVsBuyReport';
import PipelineWalkthroughReport from './PipelineWalkthroughReport';
import StateOfPlayReport from './StateOfPlayReport';
import { LEGACY_LOADERS, isExternalHref, library } from './libraryData';

const NATIVE: Record<string, () => JSX.Element> = {
  'build-vs-buy': BuildVsBuyReport,
  'state-of-play': StateOfPlayReport,
  'pipeline-walkthrough': PipelineWalkthroughReport,
};

function LegacyFrame({ slug, title }: { slug: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    LEGACY_LOADERS[slug]?.()
      .then((h) => live && setHtml(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);
  if (failed) {
    return <Callout tone="danger">This report failed to load. Reload the page to retry.</Callout>;
  }
  return html === null ? (
    <Text variant="caption" as="p" style={{ color: 'var(--semantic-color-content-secondary)' }}>
      Loading…
    </Text>
  ) : (
    <iframe title={title} srcDoc={html} sandbox="allow-scripts" style={frameStyle} />
  );
}

const frameStyle: CSSProperties = {
  width: '100%',
  height: '80vh',
  border: '1px solid var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius.md,
  background: 'var(--semantic-color-surface-base)',
};

/** @public */
export default function LibraryReportPage() {
  const { slug = '' } = useParams();
  const entry = library.find((e) => e.slug === slug);
  // Unknown slug, or an entry that lives at its own route (e.g. /ops/audit).
  if (!entry) return <Navigate to="/ops/library" replace />;
  if (isExternalHref(entry.href)) {
    window.location.replace(entry.href!);
    return null;
  }
  if (entry.href) return <Navigate to={entry.href} replace />;

  const Native = NATIVE[slug];
  return (
    <Page>
      <Stack direction="column" gap="px32">
        <PageHeader
          breadcrumbs={[
            { label: 'Ops', href: '/ops' },
            { label: 'Library', href: '/ops/library' },
            { label: entry.title },
          ]}
          title={entry.title}
        />
        {Native ? (
          <Native />
        ) : (
          <Stack direction="column" gap="px12">
            <Callout tone="warning">
              Not on HDS yet — shown as its original HTML. Source: {entry.source}
            </Callout>
            <LegacyFrame slug={slug} title={entry.title} />
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
