import type { Metadata } from 'next';
import { StatisticsScreen } from '@/components/dashboard/StatisticsScreen';

export const metadata: Metadata = { title: 'Statistiques — MétroFlow Paris' };

export default function StatistiquesPage() {
  return <StatisticsScreen />;
}
