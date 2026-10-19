'use client';

import { Clock, Dices, Gamepad2, Shuffle, Siren, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { LINES } from '@/data/lines';
import { loadNetwork } from '@/data/network';
import { generateRandomIncidents, INCIDENT_RATE_LABELS, type IncidentRate } from '@/engine/randomIncidents';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSimulation } from '@/store/simulationStore';
import type { LineId } from '@/types/network';
import { Button, cx, LineBadge, Modal, Segmented } from '../ui/primitives';

/** Ouverture de la fenêtre « Nouvelle partie » depuis n'importe quel écran. */
export const useNewGame = create<{ open: boolean }>(() => ({ open: false }));
export const openNewGame = () => useNewGame.setState({ open: true });

const H = 3600;

type Preset = 'matin' | 'journee' | 'soir' | 'perso';
const PRESETS: Record<Exclude<Preset, 'perso'>, { label: string; start: number; duration: number }> = {
  matin: { label: 'Pointe du matin', start: 7 * H, duration: 3 * H },
  soir: { label: 'Soirée', start: 17 * H, duration: 6 * H },
  journee: { label: 'Journée 24 h', start: 7 * H, duration: 24 * H },
};
const DURATIONS = [1, 2, 3, 6, 12, 24];
const DEMANDS: { value: number; label: string }[] = [
  { value: 0.85, label: 'Calme' },
  { value: 1, label: 'Normale' },
  { value: 1.15, label: 'Forte' },
];
const ALL_LINES = LINES.map((l) => l.id);

export function NewGameModal() {
  const open = useNewGame((s) => s.open);
  const close = () => useNewGame.setState({ open: false });
  return (
    <Modal open={open} onClose={close} title={<span className="flex items-center gap-2"><Gamepad2 size={16} /> Nouvelle partie</span>} width="max-w-2xl">
      {open && <NewGameForm onDone={close} />}
    </Modal>
  );
}

function NewGameForm({ onDone }: { onDone: () => void }) {
  const current = useSimulation((s) => s.managedLines);
  const [preset, setPreset] = useState<Preset>('journee');
  const [start, setStart] = useState(PRESETS.journee.start);
  const [hours, setHours] = useState(24);
  const [lines, setLines] = useState<LineId[]>(current ?? ['4', '7']);
  const [randomCount, setRandomCount] = useState(3);
  const [rate, setRate] = useState<IncidentRate>('normal');
  const [demand, setDemand] = useState(1);
  const [seed, setSeed] = useState(() => 1000 + Math.floor(Math.random() * 9000));

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'perso') {
      setStart(PRESETS[p].start);
      setHours(PRESETS[p].duration / H);
    }
  };
  const toggle = (id: LineId) => setLines((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : ALL_LINES.filter((l) => l === id || ls.includes(l))));
  const randomLines = () => {
    const pool = [...ALL_LINES];
    const out: LineId[] = [];
    while (out.length < randomCount && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setLines(ALL_LINES.filter((l) => out.includes(l)));
  };

  const duration = hours * H;
  const end = start + duration;
  const managed = lines.length === 0 || lines.length === ALL_LINES.length ? null : lines;
  const incidentCount = useMemo(() => {
    const network = loadNetwork().network;
    if (!network) return 0;
    const ls = lines.length === 0 ? ALL_LINES : lines;
    return generateRandomIncidents(network, { seed, startTime: start, duration, lines: ls, rate }).length;
  }, [seed, start, duration, lines, rate]);

  const launch = () => {
    controller.startCustomGame({ startTime: start, duration, seed, demandScale: demand, lines: managed, incidentRate: rate });
    onDone();
  };

  return (
    <div className="space-y-5 text-xs">
      <Section icon={<Clock size={13} />} title="Horaires">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
            <Chip key={p} active={preset === p} onClick={() => choosePreset(p)}>
              {PRESETS[p].label}
              <span className="ml-1 text-[10px] opacity-70">
                {fmtClock(PRESETS[p].start)} → {fmtClock(PRESETS[p].start + PRESETS[p].duration)}
              </span>
            </Chip>
          ))}
          <Chip active={preset === 'perso'} onClick={() => setPreset('perso')}>
            Personnalisé
          </Chip>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Début</span>
            <input
              type="time"
              value={fmtClock(start)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) {
                  setStart(h * H + m * 60);
                  setPreset('perso');
                }
              }}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-muted">Durée</span>
            <Segmented<number>
              value={hours}
              onChange={(v) => {
                setHours(v);
                setPreset('perso');
              }}
              options={DURATIONS.map((d) => ({ value: d, label: `${d} h` }))}
            />
          </div>
        </div>
        <p className="mt-2 text-muted">
          De <b className="text-ink">{fmtClock(start)}</b> à <b className="text-ink">{fmtClock(end)}</b>
          {end >= 24 * H && ' le lendemain'} — {hours} h simulées.
          {hours >= 12 && ' Le métro ferme la nuit (1 h 15 → 5 h 30) : le temps défile alors en accéléré.'}
        </p>
      </Section>

      <Section icon={<Users size={13} />} title={`Mes lignes — ${managed ? `${lines.length} ligne${lines.length > 1 ? 's' : ''}` : 'tout le réseau'}`}>
        <p className="mb-2 text-muted">
          Choisissez les lignes dont vous êtes responsable. Elles sont mises en avant sur le plan, les incidents imprévus tombent
          sur elles, et les autres lignes sont exploitées automatiquement.
        </p>
        <div className="mb-2 grid grid-cols-8 gap-1.5">
          {LINES.map((l) => {
            const on = lines.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(l.id)}
                className={cx(
                  'flex h-9 items-center justify-center rounded-lg border transition',
                  on ? 'border-accent bg-accent/10' : 'border-edge bg-white opacity-45 grayscale hover:opacity-80 hover:grayscale-0',
                )}
                title={`${l.name}${on ? ' (gérée)' : ''}`}
              >
                <LineBadge line={l.id} size={24} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" onClick={() => setLines([...ALL_LINES])}>
            Toutes
          </Button>
          <Button size="xs" onClick={() => setLines([])}>
            Aucune
          </Button>
          <span className="ml-2 text-muted">Au hasard :</span>
          <Segmented<number> size="xs" value={randomCount} onChange={setRandomCount} options={[1, 2, 3, 5, 8].map((n) => ({ value: n, label: String(n) }))} />
          <Button size="xs" onClick={randomLines}>
            <Shuffle size={11} /> Tirer {randomCount} ligne{randomCount > 1 ? 's' : ''}
          </Button>
        </div>
        {lines.length === 0 && <p className="mt-1.5 text-amber-700">Aucune ligne choisie : vous gérerez tout le réseau.</p>}
      </Section>

      <Section icon={<Siren size={13} />} title="Incidents imprévus">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<IncidentRate>
            value={rate}
            onChange={setRate}
            options={(Object.keys(INCIDENT_RATE_LABELS) as IncidentRate[]).map((r) => ({ value: r, label: INCIDENT_RATE_LABELS[r] }))}
          />
          <span className="text-muted">
            {incidentCount === 0 ? 'Aucun incident programmé' : `${incidentCount} incident${incidentCount > 1 ? 's' : ''} surviendront à des moments imprévus`}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-muted">Affluence</span>
          <Segmented<number> value={demand} onChange={setDemand} options={DEMANDS} />
          <span className="ml-auto flex items-center gap-1 text-muted">
            Graine
            <input type="number" className="w-20" value={seed} onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            <Button size="xs" variant="ghost" onClick={() => setSeed(1000 + Math.floor(Math.random() * 9000))} title="Nouvelle graine">
              <Dices size={13} />
            </Button>
          </span>
        </div>
        <p className="mt-2 text-[11px] text-faint">Même graine + mêmes réglages = même partie (incidents et voyageurs identiques).</p>
      </Section>

      <div className="flex justify-end gap-2 border-t border-edge pt-3">
        <Button onClick={onDone}>Annuler</Button>
        <Button variant="primary" size="md" onClick={launch}>
          <Gamepad2 size={15} /> Lancer la partie
        </Button>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-full border px-3 py-1 text-[11px] font-medium transition', active ? 'border-accent bg-accent-strong text-white' : 'border-edge-strong bg-white text-ink hover:border-accent/60')}
    >
      {children}
    </button>
  );
}
