// violating: component uses hardcoded hex color instead of token var
export function ViolatingComponent() {
  return (
    <div style={{ color: '#ff0000', background: '#ffffff' }}>
      Hardcoded colors
    </div>
  );
}
