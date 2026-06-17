// violating: plain HTML div with 7 inline style properties (threshold is 6)
export function ViolatingInlineStyles() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 16,
      margin: 0,
      color: 'blue',
      background: 'white',
    }}>too many inline styles</div>
  );
}
