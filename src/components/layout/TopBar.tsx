'use client';

import { BarChart3, Clock3, Gamepad2, Layers3, Map as MapIcon, Moon, Pause, Play, Save, Trophy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { controller } from '@/lib/simulationController';
import { fmtClock } from '@/lib/metrics';
import { useSimulation, type Speed } from '@/store/simulationStore';
import { openNewGame } from '../scenarios/NewGameModal';
import { Button, cx, Modal, Segmented } from '../ui/primitives';

const NAV = [
  { href: '/', label: 'Carte', icon: MapIcon },
  { href: '/statistiques', label: 'Statistiques', icon: BarChart3 },
  { href: '/scenarios', label: 'Scénarios', icon: Layers3 },
  { href: '/defis', label: 'Défis', icon: Trophy },
];

export const SPEEDS: Speed[] = [0.25, 0.5, 1, 2, 5, 10, 20];

/** Libellé court d'une vitesse (×¼, ×½, ×1…). */
export const speedLabel = (s: number) => `×${s === 0.25 ? '¼' : s === 0.5 ? '½' : s}`;

/** Info-bulle : temps simulé par seconde réelle. */
export const speedTitle = (s: number) => (s < 1 ? `${s * 60} s simulées par seconde` : `${s} min simulée(s) par seconde`);

export function networkStatus(k: { activeIncidents: number; saturatedSegments: number; serviceQuality: number } | undefined) {
  if (!k) return { label: '—', color: 'text-muted', dot: 'bg-slate-500' };
  if (k.serviceQuality < 70) return { label: 'Critique', color: 'text-red-600', dot: 'bg-red-500' };
  if (k.activeIncidents > 0 || k.serviceQuality < 88) return { label: 'Perturbé', color: 'text-amber-700', dot: 'bg-amber-400' };
  return { label: 'Nominal', color: 'text-emerald-700', dot: 'bg-emerald-400' };
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
          <div className="whitespace-nowrap text-[15px] font-bold tracking-tight">
            MétroFlow <span className="text-accent">Paris</span>
          </div>
          <div className="hidden text-[10px] text-muted 2xl:block">Anticipez. Régulez. Maîtrisez le réseau.</div>
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
          <Button variant="primary" onClick={openNewGame} title="Choisir les horaires (jusqu'à 24 h), vos lignes et les incidents imprévus">
            <Gamepad2 size={14} /> <span className="hidden whitespace-nowrap lg:inline">Nouvelle partie</span>
          </Button>
          <div className={cx('flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 text-xs', status.color)} title="État du réseau simulé (qualité de service et incidents actifs)">
            <span className={cx('h-2 w-2 rounded-full', status.dot, status.label !== 'Nominal' && 'animate-pulse')} />
            <span className="hidden sm:inline">Réseau</span> {status.label}
          </div>
          <div className="tabular rounded-md bg-panel-3 px-2.5 py-1 font-mono text-base font-semibold tracking-wider" title="Horloge de simulation (temps simulé)">
            {fmtClock(time, true)}
          </div>
          <ServiceBadge />
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
            options={SPEEDS.map((s) => ({ value: s, label: speedLabel(s), title: speedTitle(s) }))}
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
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#ffffff" stroke="#1e2126" strokeOpacity="0.9" />
      <path d="M6 22 L12 10 L16 18 L20 10 L26 22" fill="none" stroke="#1e2126" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.2" fill="#FFCD00" />
      <circle cx="20" cy="10" r="2.2" fill="#FA9ABA" />
      <circle cx="16" cy="18" r="2.2" fill="#2563eb" />
    </svg>
  );
}

/** Période de service horaire (affichée hors pointe) et jour de simulation. */
function ServiceBadge() {
  const service = useSimulation((s) => s.snapshot?.service);
  const time = useSimulation((s) => s.snapshot?.time ?? 0);
  const start = useSimulation((s) => s.startTime);
  const day = Math.floor(time / 86400) - Math.floor(start / 86400);
  if (!service || (service.level === 1 && day === 0)) return null;
  const closed = service.level === 0;
  return (
    <div
      className={cx('hidden items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium xl:flex', closed ? 'bg-slate-800 text-white' : 'bg-panel-3 text-muted')}
      title={closed ? 'Métro fermé : le temps défile en accéléré jusqu’à la réouverture' : `Fréquences à ${Math.round(service.level * 100)} % du programme (horaires de service)`}
    >
      {closed ? <Moon size={12} /> : <Clock3 size={12} />}
      {service.label}
      {day > 0 && <span className="ml-1 rounded bg-accent/15 px-1 text-accent">J+{day}</span>}
    </div>
  );
}
