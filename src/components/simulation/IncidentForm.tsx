'use client';

import { AlertTriangle, Siren } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadNetwork } from '@/data/network';
import {
  defaultEffects,
  describeEffect,
  INCIDENT_TYPE_INFO,
  INCIDENT_TYPES,
  SEVERITY_LABELS,
  validateIncidentSpec,
} from '@/engine/incidentManager';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSelection, useSimulation } from '@/store/simulationStore';
import type { IncidentSpec, IncidentTarget, IncidentType, Severity } from '@/types/incident';
import type { LineId } from '@/types/network';
import { Button, cx, LineBadge, Modal, Segmented } from '../ui/primitives';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Formulaire de création de perturbation (ouvert depuis une station, un tronçon ou la barre latérale). */
export function IncidentFormModal() {
  const draft = useSelection((s) => s.incidentDraft);
  const close = useSelection((s) => s.closeIncidentForm);
  return (
    <Modal open={!!draft} onClose={close} title={<span className="flex items-center gap-2"><Siren size={15} className="text-red-600" /> Ajouter une perturbation</span>} width="max-w-2xl">
      {draft && <IncidentForm key={JSON.stringify(draft)} initialStation={draft.stationId} initialSegment={draft.segmentId} initialLine={draft.line} onDone={close} />}
    </Modal>
  );
}

function IncidentForm({
  initialStation,
  initialSegment,
  initialLine,
  onDone,
}: {
  initialStation?: string;
  initialSegment?: string;
  initialLine?: string;
  onDone: () => void;
}) {
  const network = loadNetwork().network!;
  const now = useSimulation((s) => s.snapshot?.time ?? s.startTime);
  const endTime = useSimulation((s) => s.endTime);

  const [type, setType] = useState<IncidentType>(initialSegment ? 'segment_interruption' : 'malaise');
  const [stationQuery, setStationQuery] = useState(initialStation ? network.stationById.get(initialStation)?.name ?? '' : '');
  const [stationId, setStationId] = useState<string | undefined>(initialStation);
  const [line, setLine] = useState<LineId | ''>((initialLine as LineId) ?? '');
  const [segmentId, setSegmentId] = useState<string | undefined>(initialSegment);
  const [severity, setSeverity] = useState<Severity>(3);
  const [durationMin, setDurationMin] = useState(15);
  const [permanent, setPermanent] = useState(false);
  const [radius, setRadius] = useState(INCIDENT_TYPE_INFO.malaise.defaultRadius);
  const [stopTraffic, setStopTraffic] = useState(false);
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [startAt, setStartAt] = useState(fmtClock(now + 600));
  const [disabledEffects, setDisabledEffects] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const info = INCIDENT_TYPE_INFO[type];

  // Valeurs par défaut au changement de type.
  useEffect(() => {
    setRadius(info.defaultRadius);
    if (info.defaultDuration) setDurationMin(Math.round(info.defaultDuration / 60));
    setDisabledEffects(new Set());
  }, [type, info.defaultRadius, info.defaultDuration]);

  const station = stationId ? network.stationById.get(stationId) : undefined;
  const matches = useMemo(() => {
    const q = norm(stationQuery);
    if (!q || (station && norm(station.name) === q)) return [];
    return network.stations.filter((s) => norm(s.name).includes(q)).slice(0, 8);
  }, [stationQuery, network, station]);
  const unknownStation = stationQuery.trim().length >= 3 && !station && matches.length === 0;

  const adjacentSegments = useMemo(() => {
    if (!station) return network.segments;
    return network.segments.filter((s) => (s.a === station.id || s.b === station.id) && (!line || s.line === line));
  }, [station, line, network]);

  // Choix de la cible selon le type.
  const targetKind: IncidentTarget['kind'] = useMemo(() => {
    if (type === 'segment_interruption') return segmentId ? 'segment' : 'station';
    if ((type === 'line_slowdown' || type === 'frequency_reduction') && !station) return 'line';
    if (type === 'return_to_normal' && !station && !segmentId) return line ? 'line' : 'network';
    if ((type === 'technical_failure' || type === 'major_delay') && segmentId && !station) return 'segment';
    return 'station';
  }, [type, segmentId, station, line]);

  const target: IncidentTarget | null = useMemo(() => {
    switch (targetKind) {
      case 'station':
        return station ? { kind: 'station', stationId: station.id, ...(line ? { line } : {}) } : null;
      case 'segment':
        return segmentId ? { kind: 'segment', segmentId } : null;
      case 'line':
        return line ? { kind: 'line', line } : null;
      default:
        return { kind: 'network' };
    }
  }, [targetKind, station, line, segmentId]);

  const startTime = useMemo(() => {
    if (timing === 'now') return undefined;
    const [h, m] = startAt.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    const day = Math.floor(now / 86400) * 86400;
    let t = day + h * 3600 + m * 60;
    if (t < now - 60) t += 86400;
    return t;
  }, [timing, startAt, now]);

  const baseSpec: IncidentSpec | null = target
    ? {
        type,
        target,
        severity,
        radius,
        duration: type === 'return_to_normal' ? 0 : permanent ? null : durationMin * 60,
        options: { stopTraffic },
        ...(startTime !== undefined ? { startTime } : {}),
      }
    : null;

  const effects = useMemo(() => {
    if (!baseSpec) return [];
    try {
      return defaultEffects(network, baseSpec);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, type, JSON.stringify(target), severity, radius, stopTraffic]);

  const submit = () => {
    setError(null);
    if (!baseSpec) {
      setError(unknownStation ? 'Station indisponible dans cette version du réseau.' : 'Choisissez une cible.');
      return;
    }
    if (startTime !== undefined && (!Number.isFinite(startTime) || startTime >= endTime)) {
      setError('Heure de déclenchement invalide ou postérieure à la fin du scénario.');
      return;
    }
    const custom = disabledEffects.size > 0;
    const spec: IncidentSpec = { ...baseSpec, ...(custom ? { effects: effects.filter((_, i) => !disabledEffects.has(i)) } : {}) };
    if (custom && spec.effects!.length === 0) {
      setError('Au moins un effet doit rester actif.');
      return;
    }
    const err = validateIncidentSpec(network, spec);
    if (err) {
      setError(err);
      return;
    }
    if (controller.dispatch({ type: 'incident.create', spec })) onDone();
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Type */}
      <div>
        <Label>Type d&apos;incident</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              className={cx(
                'rounded-md border px-2 py-1.5 text-left transition-colors',
                type === t.type ? 'border-red-400/70 bg-red-500/15 text-ink' : 'border-edge bg-panel-2 text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{info.description}</p>
      </div>

      {/* Cible */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative">
          <Label>Station {targetKind === 'line' || targetKind === 'network' ? '(facultative)' : ''}</Label>
          <input
            type="text"
            className="w-full"
            placeholder="Rechercher une station…"
            value={stationQuery}
            onChange={(e) => {
              setStationQuery(e.target.value);
              setStationId(undefined);
              setSegmentId(undefined);
            }}
            aria-label="Station"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-edge-strong bg-panel shadow-xl">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-panel-3"
                    onClick={() => {
                      setStationId(m.id);
                      setStationQuery(m.name);
                      setLine('');
                    }}
                  >
                    {m.lines.map((l) => (
                      <LineBadge key={l} line={l} size={14} />
                    ))}
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unknownStation && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              Station indisponible dans cette version : seules les lignes 1, 4, 7, 9 et 14 sont modélisées. Aucune connexion fictive n&apos;est créée.
            </p>
          )}
        </div>
        <div>
          <Label>Ligne {station ? '(facultatif : toutes les lignes de la station)' : ''}</Label>
          <select value={line} onChange={(e) => setLine(e.target.value as LineId | '')} className="w-full" aria-label="Ligne">
            <option value="">{station ? 'Toutes les lignes de la station' : '—'}</option>
            {(station ? station.lines : network.lines.map((l) => l.id)).map((l) => (
              <option key={l} value={l}>
                Ligne {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(type === 'segment_interruption' || type === 'technical_failure' || type === 'major_delay') && (
        <div>
          <Label>Tronçon {type === 'segment_interruption' ? '' : '(facultatif : sinon autour de la station)'}</Label>
          <select value={segmentId ?? ''} onChange={(e) => setSegmentId(e.target.value || undefined)} className="w-full" aria-label="Tronçon">
            <option value="">{type === 'segment_interruption' ? 'Tous les tronçons adjacents à la station' : '—'}</option>
            {adjacentSegments.map((s) => (
              <option key={s.id} value={s.id}>
                L{s.line} — {network.stationById.get(s.a)?.name} ↔ {network.stationById.get(s.b)?.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {type !== 'return_to_normal' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Gravité</Label>
            <Segmented<Severity> value={severity} onChange={setSeverity} options={([1, 2, 3] as Severity[]).map((s) => ({ value: s, label: SEVERITY_LABELS[s] }))} />
          </div>
          <div>
            <Label>Durée</Label>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={120} value={durationMin} disabled={permanent} onChange={(e) => setDurationMin(Number(e.target.value))} className="flex-1" aria-label="Durée en minutes" />
              <span className="tabular w-12 text-right">{permanent ? '∞' : `${durationMin} min`}</span>
            </div>
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} /> Permanent (jusqu&apos;à levée manuelle)
            </label>
          </div>
          <div>
            <Label>Rayon d&apos;impact</Label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={3} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="flex-1" aria-label="Rayon d'impact" />
              <span className="tabular w-16 text-right">{radius} inter-st.</span>
            </div>
          </div>
        </div>
      )}

      {type === 'station_closure' && (
        <label className="flex items-center gap-2 text-[11px] text-muted">
          <input type="checkbox" checked={stopTraffic} onChange={(e) => setStopTraffic(e.target.checked)} />
          Interrompre aussi la circulation des trains (sinon passage sans arrêt)
        </label>
      )}

      {type !== 'return_to_normal' && (
        <div>
          <Label>Déclenchement</Label>
          <div className="flex items-center gap-3">
            <Segmented value={timing} onChange={setTiming} options={[{ value: 'now', label: 'Immédiat' }, { value: 'later', label: 'Programmé' }]} />
            {timing === 'later' && <input type="time" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="Heure de déclenchement" />}
            <span className="text-[11px] text-faint">Heure simulée actuelle : {fmtClock(now)}</span>
          </div>
        </div>
      )}

      {/* Effets explicites */}
      {type !== 'return_to_normal' && (
        <div>
          <Label>Conséquences sur le trafic (effets appliqués au moteur — décochez pour personnaliser)</Label>
          <ul className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-edge bg-panel-2 p-2">
            {effects.length === 0 && <li className="text-faint">Choisissez une cible pour voir les effets.</li>}
            {effects.map((e, i) => (
              <li key={i}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!disabledEffects.has(i)}
                    onChange={(ev) => {
                      const next = new Set(disabledEffects);
                      if (ev.target.checked) next.delete(i);
                      else next.add(i);
                      setDisabledEffects(next);
                    }}
                  />
                  <span className={cx(disabledEffects.has(i) && 'text-faint line-through')}>{describeEffect(network, e)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-50 px-2 py-1.5 text-red-700">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Annuler</Button>
        <Button variant="danger" onClick={submit} disabled={!target}>
          <Siren size={14} /> {type === 'return_to_normal' ? 'Rétablir' : timing === 'now' ? 'Déclencher' : 'Programmer'}
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{children}</div>;
}
