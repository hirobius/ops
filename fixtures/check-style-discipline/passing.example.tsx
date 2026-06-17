// passing: fewer than 6 inline style properties on HTML element
export function PassingInlineStyles() {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      Acceptable inline styles
    </div>
  );
}
