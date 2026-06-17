import { useTheme } from '@hirobius/design-system/contexts';
import { InfoPage } from '@hirobius/design-system';

export default function InfoPageWrapper() {
  const { isDark } = useTheme();
  return <InfoPage isDark={isDark} />;
}
