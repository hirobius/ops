// passing: uses token references for font family, no fontWeight override
import { hds } from '../src/app/design-system/tokens';

export function PassingTypography() {
  return (
    <div style={{ fontFamily: hds.monoFamily }}>
      Token-based font reference
    </div>
  );
}
