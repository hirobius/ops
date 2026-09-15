// Real violating fixture for check-focus-states.
//
// Drawn from an actual defect: on 2026-09-15 eight anchors like these shipped to
// main across StandingPage.tsx and PitchPage.tsx. A keyboard user tabbing through
// the page could not see where they were, because a bare <a> styled only with an
// inline style object inherits no focus ring from the design system.
//
// The gate SHOULD flag every element below.

const s = {
  rowLink: { color: 'var(--semantic-color-content-accent)' },
  chip: { padding: '4px 8px' },
};

export function ViolatingExample({ url, phone }: { url: string; phone: string }) {
  return (
    <div>
      {/* no className at all — nothing supplies a focus ring */}
      <a href={url} target="_blank" rel="noreferrer" style={s.rowLink}>
        Open the pull request
      </a>

      {/* a tel: link is still a focusable interactive element */}
      <a href={`tel:${phone}`} style={s.chip}>
        Call {phone}
      </a>

      {/* multi-line form — the gate must catch this shape too, not just one-liners */}
      <a
        href={`https://github.com/hirobius/ops/issues/1`}
        target="_blank"
        rel="noreferrer"
        style={s.chip}
      >
        #1
      </a>
    </div>
  );
}
