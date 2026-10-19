import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'MétroFlow Paris — Simulateur de gestion du métro',
  description:
    'Anticipez. Régulez. Maîtrisez le réseau. Simulateur expérimental de flux de voyageurs sur un sous-réseau du métro parisien (données de demande synthétiques).',
};

export const viewport: Viewport = {
  themeColor: '#060a13',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
