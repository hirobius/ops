// violating: interactive button with no motion feedback
export function ViolatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ cursor: 'pointer' }}>
      Click me
    </button>
  );
}
