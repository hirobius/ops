// passing: spacing values routed through token vars
import { hds } from '../src/app/design-system/tokens';

export function PassingSpacing() {
  return (
    <div style={{ padding: hds.space.px16, gap: hds.density.lg }}>
      Token-based spacing
    </div>
  );
}
