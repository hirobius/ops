// violating fixture for check-token-paths-ratchet
// References a non-existent token path — the gate should flag this as a new violation.

const style = {
  color: 'primitive.nonexistent.ghost.red',
};

export function ViolatingExample() {
  return <div style={style}>violating token path example</div>;
}
