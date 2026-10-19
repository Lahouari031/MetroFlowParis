import type { Metadata } from 'next';
import { ChallengeScreen } from '@/components/scenarios/ChallengePanel';

export const metadata: Metadata = { title: 'Défis — MétroFlow Paris' };

export default function DefisPage() {
  return <ChallengeScreen />;
}
