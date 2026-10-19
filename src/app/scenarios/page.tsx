import type { Metadata } from 'next';
import { ScenariosScreen } from '@/components/scenarios/ScenariosScreen';

export const metadata: Metadata = { title: 'Scénarios — MétroFlow Paris' };

export default function ScenariosPage() {
  return <ScenariosScreen />;
}
