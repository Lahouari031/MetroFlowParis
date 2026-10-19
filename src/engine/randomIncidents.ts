import type { IncidentType, Severity } from '@/types/incident';
import type { LineId, Network } from '@/types/network';
import type { ScheduledIncident } from '@/types/scenario';
import { INCIDENT_TYPE_INFO } from './incidentManager';
import { Rng } from './rng';
import { demandOpen, servicePeriod } from './servicePeriods';

export type IncidentRate = 'aucun' | 'rare' | 'normal' | 'frequent';

/** Nombre moyen d'incidents par heure de service pour une ligne gérée, selon le réglage choisi (valeurs de jeu). */
export const INCIDENT_RATE_PER_HOUR: Record<IncidentRate, number> = { aucun: 0, rare: 0.15, normal: 0.3, frequent: 0.6 };

export const INCIDENT_RATE_LABELS: Record<IncidentRate, string> = { aucun: 'Aucun', rare: 'Rares', normal: 'Normaux', frequent: 'Fréquents' };

/** Types tirés au sort et leur poids relatif (les incidents graves sont plus rares). */
const TYPE_WEIGHTS: [IncidentType, number][] = [
  ['malaise', 30],
  ['technical_failure', 15],
  ['line_slowdown', 12],
  ['major_delay', 12],
  ['frequency_reduction', 10],
  ['crowd_surge', 8],
  ['segment_interruption', 6],
  ['transfer_incident', 4],
  ['station_closure', 3],
];
const SEVERITY_WEIGHTS: [Severity, number][] = [
  [1, 45],
  [2, 38],
  [3, 17],
];

function pick<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let u = rng.next() * total;
  for (const [item, w] of items) {
    u -= w;
    if (u <= 0) return item;
  }
  return items[items.length - 1][0];
}

/**
 * Incidents aléatoires programmés sur les lignes gérées par le joueur. Le tirage dépend seulement
 * de la graine et des paramètres : la partie reste reproductible (sauvegarde, rejeu, comparaison).
 * Aucun incident pendant la fermeture de nuit ni dans le dernier quart d'heure de la partie.
 */
export function generateRandomIncidents(
  network: Network,
  opts: { seed: number; startTime: number; duration: number; lines: LineId[]; rate: IncidentRate },
): ScheduledIncident[] {
  const perHour = INCIDENT_RATE_PER_HOUR[opts.rate];
  const lines = opts.lines.filter((l) => network.lineById.has(l));
  if (perHour <= 0 || lines.length === 0) return [];
  const rng = new Rng((opts.seed ^ 0x5bd1e995) >>> 0);
  const out: ScheduledIncident[] = [];
  // Plus de lignes gérées = plus d'incidents (racine : 1 ligne → ×1, 4 lignes → ×2, 16 → ×4).
  const meanGap = 3600 / (perHour * Math.sqrt(lines.length));
  let offset = 5 * 60;
  for (;;) {
    offset += -Math.log(1 - rng.next()) * meanGap;
    if (offset > opts.duration - 15 * 60) break;
    const t = opts.startTime + offset;
    if (servicePeriod(t).level === 0 || !demandOpen(t)) continue;
    const line = lines[Math.floor(rng.next() * lines.length)];
    const type = pick(rng, TYPE_WEIGHTS);
    const severity = pick(rng, SEVERITY_WEIGHTS);
    const info = INCIDENT_TYPE_INFO[type];
    const lineSegments = network.segments.filter((s) => s.line === line);
    const stations = [...new Set(lineSegments.flatMap((s) => [s.a, s.b]))];
    const hubs = stations.filter((id) => (network.stationById.get(id)?.lines.length ?? 0) > 1);
    const pool = type === 'transfer_incident' && hubs.length > 0 ? hubs : stations;
    const station = pool[Math.floor(rng.next() * pool.length)];
    const segment = lineSegments[Math.floor(rng.next() * lineSegments.length)];
    const durationMin = 10 + Math.round(rng.next() * 30);
    const target =
      type === 'segment_interruption' || type === 'major_delay'
        ? { kind: 'segment' as const, segmentId: segment.id }
        : type === 'line_slowdown' || type === 'frequency_reduction'
          ? { kind: 'line' as const, line }
          : { kind: 'station' as const, stationId: station, line };
    out.push({
      offset: Math.round(offset / 10) * 10,
      type,
      target,
      severity,
      radius: info.defaultRadius,
      duration: Math.min(durationMin * 60, Math.max(600, opts.duration - offset - 60)),
      surprise: true,
      ...(type === 'station_closure' ? { options: { stopTraffic: false } } : {}),
    });
  }
  return out;
}
