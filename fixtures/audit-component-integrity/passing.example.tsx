// passing: component uses token CSS vars for all color values
export function PassingComponent() {
  return (
    <div style={{ color: 'var(--semantic-color-text-primary)' }}>
      Token-based colors
    </div>
  );
}
