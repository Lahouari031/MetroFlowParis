'use client';

import { BarChart3, Map as MapIcon, Pause, Play, Save, Trophy, Layers3 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { controller } from '@/lib/simulationController';
import { fmtClock } from '@/lib/metrics';
import { useSimulation, type Speed } from '@/store/simulationStore';
import { Button, cx, Modal, Segmented } from '../ui/primitives';

const NAV = [
  { href: '/', label: 'Carte', icon: MapIcon },
  { href: '/statistiques', label: 'Statistiques', icon: BarChart3 },
  { href: '/scenarios', label: 'Scénarios', icon: Layers3 },
  { href: '/defis', label: 'Défis', icon: Trophy },
];

export const SPEEDS: Speed[] = [1, 2, 5, 10];

export function networkStatus(k: { activeIncidents: number; saturatedSegments: number; serviceQuality: number } | undefined) {
  if (!k) return { label: '—', color: 'text-muted', dot: 'bg-slate-500' };
  if (k.serviceQuality < 70) return { label: 'Critique', color: 'text-red-300', dot: 'bg-red-500' };
  if (k.activeIncidents > 0 || k.serviceQuality < 88) return { label: 'Perturbé', color: 'text-amber-300', dot: 'bg-amber-400' };
  return { label: 'Nominal', color: 'text-emerald-300', dot: 'bg-emerald-400' };
}

export function TopBar() {
  const pathname = usePathname();
  const time = useSimulation((s) => s.snapshot?.time ?? 0);
  const kpis = useSimulation((s) => s.snapshot?.kpis);
  const running = useSimulation((s) => s.running);
  const speed = useSimulation((s) => s.speed);
  const ready = useSimulation((s) => s.ready);
  const title = useSimulation((s) => s.scenarioTitle);
  const status = networkStatus(kpis);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-edge bg-panel px-3">
      <Link href="/" className="flex items-center gap-2.5 pr-2">
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">
            MétroFlow <span className="text-accent">Paris</span>
          </div>
          <div className="hidden text-[10px] text-muted xl:block">Anticipez. Régulez. Maîtrisez le réseau.</div>
        </div>
      </Link>

      <nav className="flex items-center gap-1" aria-label="Navigation principale">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                active ? 'bg-accent-strong/20 text-accent' : 'text-muted hover:bg-panel-3 hover:text-ink',
              )}
            >
              <Icon size={14} />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden min-w-0 flex-1 truncate text-xs text-muted md:block" title={title}>
        {title}
      </div>

      {ready && (
        <div className="ml-auto flex items-center gap-3">
          <div className={cx('flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-xs', status.color)} title="État du réseau simulé (qualité de service et incidents actifs)">
            <span className={cx('h-2 w-2 rounded-full', status.dot, status.label !== 'Nominal' && 'animate-pulse')} />
            <span className="hidden sm:inline">Réseau</span> {status.label}
          </div>
          <div className="tabular rounded-md bg-panel-3 px-2.5 py-1 font-mono text-base font-semibold tracking-wider" title="Horloge de simulation (temps simulé)">
            {fmtClock(time, true)}
          </div>
          <Button
            variant={running ? 'subtle' : 'primary'}
            onClick={() => controller.toggle()}
            aria-label={running ? 'Mettre en pause' : 'Reprendre'}
            title="Pause / reprise (barre d'espace)"
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Pause' : 'Reprendre'}
          </Button>
          <Segmented
            value={speed}
            onChange={(v) => controller.setSpeed(v)}
            options={SPEEDS.map((s) => ({ value: s, label: `×${s}`, title: `${s} min simulée(s) par seconde` }))}
          />
          <Button variant="ghost" onClick={() => setSaveOpen(true)} title="Sauvegarder le scénario en cours">
            <Save size={14} />
          </Button>
        </div>
      )}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Sauvegarder le scénario" width="max-w-md">
        <form
          className="space-y-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (controller.saveCurrent(name)) {
              setSaveOpen(false);
              setName('');
            }
          }}
        >
          <p className="text-xs text-muted">
            La sauvegarde contient la graine, les paramètres initiaux, les incidents programmés et le journal de vos actions : la
            simulation sera reconstruite à l&apos;identique jusqu&apos;à {fmtClock(time)}.
          </p>
          <input type="text" className="w-full" placeholder="Nom de la sauvegarde" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSaveOpen(false)}>Annuler</Button>
            <Button variant="primary" type="submit">
              <Save size={14} /> Sauvegarder
            </Button>
          </div>
        </form>
      </Modal>
    </header>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0b1a2e" stroke="#38bdf8" strokeOpacity="0.6" />
      <path d="M6 22 L12 10 L16 18 L20 10 L26 22" fill="none" stroke="#38bdf8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.2" fill="#FFCD00" />
      <circle cx="20" cy="10" r="2.2" fill="#FA9ABA" />
      <circle cx="16" cy="18" r="2.2" fill="#fff" />
    </svg>
  );
}
