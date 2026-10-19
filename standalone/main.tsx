import { createRoot } from 'react-dom/client';
import { MapDashboard } from '@/components/layout/MapDashboard';
import { AppShell } from '@/components/layout/AppShell';
import { StatisticsScreen } from '@/components/dashboard/StatisticsScreen';
import { ScenariosScreen } from '@/components/scenarios/ScenariosScreen';
import { ChallengeScreen } from '@/components/scenarios/ChallengePanel';
import { useRoute } from './router';

function Screen() {
  const path = useRoute((s) => s.path);
  if (path.startsWith('/statistiques')) return <StatisticsScreen />;
  if (path.startsWith('/scenarios')) return <ScenariosScreen />;
  if (path.startsWith('/defis')) return <ChallengeScreen />;
  return <MapDashboard />;
}

createRoot(document.getElementById('root')!).render(
  <AppShell>
    <Screen />
  </AppShell>,
);
