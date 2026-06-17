// violating: raw pixel values in padding and gap spacing props
export function ViolatingSpacing() {
  return (
    <div style={{ padding: '16px', gap: '24px', marginBottom: '32px' }}>
      Hardcoded spacing values
    </div>
  );
}
