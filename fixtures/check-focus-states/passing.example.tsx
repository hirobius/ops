// Real passing fixture for check-focus-states.
//
// The same three elements as violating.example.tsx, fixed the two sanctioned
// ways: `className="hds-focus"` supplies the ring directly, and the design
// system's own Button/IconButton/Input already include it.
//
// The gate should flag NOTHING below.

import { Button } from '@hirobius/design-system';

const s = {
  rowLink: { color: 'var(--semantic-color-content-accent)' },
  chip: { padding: '4px 8px' },
};

export function PassingExample({ url, phone }: { url: string; phone: string }) {
  return (
    <div>
      <a href={url} target="_blank" rel="noreferrer" className="hds-focus" style={s.rowLink}>
        Open the pull request
      </a>

      <a href={`tel:${phone}`} className="hds-focus" style={s.chip}>
        Call {phone}
      </a>

      <a
        href={`https://github.com/hirobius/ops/issues/1`}
        target="_blank"
        rel="noreferrer"
        className="hds-focus"
        style={s.chip}
      >
        #1
      </a>

      {/* a DS component carries its own focus treatment — no class needed */}
      <Button onClick={() => undefined}>Refresh</Button>
    </div>
  );
}
