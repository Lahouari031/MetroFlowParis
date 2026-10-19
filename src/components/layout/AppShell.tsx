'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { controller } from '@/lib/simulationController';
import { useSettings } from '@/store/settingsStore';
import { useSimulation } from '@/store/simulationStore';
import { NewGameModal } from '../scenarios/NewGameModal';
import { ResultModal } from '../scenarios/ResultModal';
import { cx } from '../ui/primitives';
import { BottomTimeline } from './BottomTimeline';
import { TopBar } from './TopBar';
import { FeedToasts, useTrafficFeedSync } from './TrafficFeed';

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useSimulation((s) => s.ready);
  const dataIssues = useSimulation((s) => s.dataIssues);
  useTrafficFeedSync();

  useEffect(() => {
    useSettings.getState().hydrate();
    controller.init();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        controller.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const blocking = dataIssues.filter((i) => i.level === 'error');

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-night">
      <TopBar />
      <main className="relative min-h-0 flex-1">
        {blocking.length > 0 ? (
          <DataErrorScreen />
        ) : ready ? (
          children
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
            <Loader2 className="animate-spin" size={16} /> Construction du réseau et initialisation du moteur…
          </div>
        )}
      </main>
      {ready && <BottomTimeline />}
      <Toasts />
      {ready && <FeedToasts />}
      <BusyOverlay />
      <ResultModal />
      <NewGameModal />
    </div>
  );
}

function DataErrorScreen() {
  const issues = useSimulation((s) => s.dataIssues);
  return (
    <div className="panel-scroll h-full p-8">
      <div className="mx-auto max-w-3xl rounded-xl border border-red-500/40 bg-red-50 p-6">
        <h1 className="mb-2 flex items-center gap-2 text-lg font-semibold text-red-600">
          <AlertTriangle size={20} /> Données du réseau invalides
        </h1>
        <p className="mb-4 text-sm text-ink/80">
          Le simulateur refuse de démarrer avec des données incohérentes plutôt que de masquer les erreurs. Corrigez les fichiers de
          <code className="mx-1 rounded bg-panel-3 px-1">src/data/</code> puis rechargez la page.
        </p>
        <ul className="space-y-1 text-sm">
          {issues.map((i, k) => (
            <li key={k} className={i.level === 'error' ? 'text-red-600' : 'text-amber-700'}>
              <code className="mr-2 text-xs opacity-70">{i.code}</code>
              {i.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Toasts() {
  const notice = useSimulation((s) => s.notice);
  const storageError = useSettings((s) => s.storageError);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useSimulation.setState({ notice: null }), notice.level === 'error' ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [notice]);
  return (
    <div className="pointer-events-none fixed right-4 top-14 z-[120] flex w-96 flex-col gap-2">
      {storageError && (
        <div className="pointer-events-auto rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-xl">
          {storageError}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className={cx(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-xs shadow-xl',
            notice.level === 'error' && 'border-red-500/50 bg-red-50 text-red-800',
            notice.level === 'success' && 'border-emerald-500/50 bg-emerald-50 text-emerald-800',
            notice.level === 'info' && 'border-sky-500/40 bg-white text-sky-800',
          )}
        >
          {notice.level === 'error' ? <AlertTriangle size={14} /> : notice.level === 'success' ? <CheckCircle2 size={14} /> : <Info size={14} />}
          <span className="flex-1">{notice.message}</span>
          <button type="button" aria-label="Fermer" onClick={() => useSimulation.setState({ notice: null })} className="opacity-70 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function BusyOverlay() {
  const busy = useSimulation((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="w-80 rounded-xl border border-edge-strong bg-panel p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin text-accent" /> {busy.label}
        </div>
        <div className="h-1.5 overflow-hidden rounded bg-panel-3">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
