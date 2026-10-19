/**
 * Catalogue des incidents et traduction en effets explicites sur le réseau.
 * Toutes les règles sont ici, documentées dans docs/MODEL.md (section « Perturbations »).
 */
import type { Incident, IncidentEffect, IncidentSpec, IncidentTarget, IncidentType, Severity } from '@/types/incident';
import type { LineId, Network } from '@/types/network';

export interface IncidentTypeInfo {
  type: IncidentType;
  label: string;
  description: string;
  /** Cibles possibles. */
  targets: IncidentTarget['kind'][];
  defaultDuration: number | null;
  defaultRadius: number;
}

export const INCIDENT_TYPES: IncidentTypeInfo[] = [
  {
    type: 'malaise',
    label: 'Malaise voyageur',
    description: 'Train retenu à quai : arrêt prolongé et capacité réduite autour de la station, sans fermeture.',
    targets: ['station'],
    defaultDuration: 15 * 60,
    defaultRadius: 1,
  },
  {
    type: 'station_closure',
    label: 'Fermeture de station',
    description: "Station fermée au public : ni entrée, ni sortie, ni correspondance. Les trains traversent sans s'arrêter (sauf arrêt de la circulation).",
    targets: ['station'],
    defaultDuration: 30 * 60,
    defaultRadius: 0,
  },
  {
    type: 'segment_interruption',
    label: 'Interruption de tronçon',
    description: 'Le tronçon est retiré du graphe : aucun train ne circule entre les deux stations.',
    targets: ['segment', 'station'],
    defaultDuration: 30 * 60,
    defaultRadius: 0,
  },
  {
    type: 'technical_failure',
    label: 'Panne technique',
    description: 'Panne de matériel ou de signalisation : marche ralentie et capacité réduite sur la zone.',
    targets: ['station', 'segment'],
    defaultDuration: 20 * 60,
    defaultRadius: 1,
  },
  {
    type: 'line_slowdown',
    label: 'Ralentissement de ligne',
    description: 'Marche ralentie sur toute la ligne. À flotte constante, la fréquence réelle baisse.',
    targets: ['line', 'station'],
    defaultDuration: 30 * 60,
    defaultRadius: 0,
  },
  {
    type: 'frequency_reduction',
    label: 'Réduction de fréquence',
    description: "Moins de trains (manque de conducteurs, matériel indisponible) : attente plus longue et capacité réduite.",
    targets: ['line', 'station'],
    defaultDuration: 45 * 60,
    defaultRadius: 0,
  },
  {
    type: 'major_delay',
    label: 'Retard important',
    description: 'Régulation lourde : temps de parcours fortement allongés et capacité réduite sur plusieurs inter-stations.',
    targets: ['station', 'segment'],
    defaultDuration: 20 * 60,
    defaultRadius: 2,
  },
  {
    type: 'crowd_surge',
    label: 'Affluence exceptionnelle',
    description: 'Événement, sortie de stade, report de trafic : la demande émise et attirée augmente autour de la station.',
    targets: ['station'],
    defaultDuration: 45 * 60,
    defaultRadius: 1,
  },
  {
    type: 'transfer_incident',
    label: 'Incident de correspondance',
    description: 'Couloir encombré ou fermé : correspondances ralenties, voire impossibles (gravité élevée).',
    targets: ['station'],
    defaultDuration: 20 * 60,
    defaultRadius: 0,
  },
  {
    type: 'return_to_normal',
    label: 'Retour à la normale',
    description: 'Lève immédiatement tous les incidents actifs sur la cible (station et tronçons adjacents, ligne, ou réseau).',
    targets: ['station', 'segment', 'line', 'network'],
    defaultDuration: 0,
    defaultRadius: 0,
  },
];

export const INCIDENT_TYPE_INFO: Record<IncidentType, IncidentTypeInfo> = Object.fromEntries(
  INCIDENT_TYPES.map((t) => [t.type, t]),
) as Record<IncidentType, IncidentTypeInfo>;

export const SEVERITY_LABELS: Record<Severity, string> = { 1: 'Faible', 2: 'Moyenne', 3: 'Élevée' };

/** Paramètres des effets par type et par gravité (index 0 = faible). */
export const EFFECT_PARAMETERS = {
  malaise: { timeAdd: [60, 150, 300], capacity: [0.85, 0.6, 0.35], lineFrequency: [1, 1, 0.9] },
  technical_failure: { speed: [1.3, 1.6, 2.2], capacity: [0.75, 0.5, 0.3] },
  line_slowdown: { speed: [1.15, 1.3, 1.5] },
  frequency_reduction: { frequency: [0.85, 0.7, 0.5] },
  major_delay: { timeAdd: [180, 360, 600], capacity: [0.7, 0.5, 0.35] },
  crowd_surge: { demand: [2, 4, 8] },
  transfer_incident: { penalty: [180, 420, null] as (number | null)[] },
} as const;

/** Atténuation de l'effet avec la distance (en inter-stations). */
export const RADIUS_DECAY = 0.5;

/** Tronçons d'une ligne situés à h inter-stations (h = 0 : adjacents) d'une station. */
export function segmentsAround(network: Network, stationId: string, line: LineId, radius: number): Map<string, number> {
  const result = new Map<string, number>();
  let frontier = [stationId];
  const visited = new Set([stationId]);
  for (let h = 0; h <= radius; h++) {
    const next: string[] = [];
    for (const st of frontier) {
      for (const seg of network.segments) {
        if (seg.line !== line || (seg.a !== st && seg.b !== st)) continue;
        if (!result.has(seg.id)) result.set(seg.id, h);
        const other = seg.a === st ? seg.b : seg.a;
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return result;
}

/** Tronçons concernés par une cible, avec leur distance (en inter-stations). */
export function affectedSegments(network: Network, target: IncidentTarget, radius: number): Map<string, number> {
  const out = new Map<string, number>();
  const merge = (m: Map<string, number>) => {
    for (const [k, v] of m) out.set(k, Math.min(v, out.get(k) ?? Infinity));
  };
  if (target.kind === 'station') {
    const st = network.stationById.get(target.stationId);
    if (!st) return out;
    const lines = target.line ? [target.line] : st.lines;
    for (const l of lines) merge(segmentsAround(network, st.id, l, radius));
  } else if (target.kind === 'segment') {
    const seg = network.segmentById.get(target.segmentId);
    if (!seg) return out;
    out.set(seg.id, 0);
    if (radius > 0) {
      for (const end of [seg.a, seg.b]) {
        for (const [k, v] of segmentsAround(network, end, seg.line, radius - 1)) {
          if (k !== seg.id) out.set(k, Math.min(v + 1, out.get(k) ?? Infinity));
        }
      }
    }
  } else if (target.kind === 'line') {
    for (const seg of network.segments) if (seg.line === target.line) out.set(seg.id, 0);
  } else {
    for (const seg of network.segments) out.set(seg.id, 0);
  }
  return out;
}

function targetLines(network: Network, target: IncidentTarget): LineId[] {
  if (target.kind === 'line') return [target.line];
  if (target.kind === 'station') {
    if (target.line) return [target.line];
    return network.stationById.get(target.stationId)?.lines ?? [];
  }
  if (target.kind === 'segment') {
    const seg = network.segmentById.get(target.segmentId);
    return seg ? [seg.line] : [];
  }
  return network.lines.map((l) => l.id);
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Effets par défaut d'un incident (règles explicites). */
export function defaultEffects(network: Network, spec: IncidentSpec): IncidentEffect[] {
  const sev = spec.severity - 1;
  const { target } = spec;
  const effects: IncidentEffect[] = [];
  const decay = (h: number) => RADIUS_DECAY ** h;

  switch (spec.type) {
    case 'malaise': {
      const p = EFFECT_PARAMETERS.malaise;
      for (const [segmentId, h] of affectedSegments(network, target, spec.radius)) {
        effects.push({ kind: 'segmentTimeAdd', segmentId, seconds: Math.round(p.timeAdd[sev] * decay(h)) });
        effects.push({ kind: 'segmentCapacityFactor', segmentId, factor: round(1 - (1 - p.capacity[sev]) * decay(h)) });
      }
      if (p.lineFrequency[sev] < 1) {
        for (const line of targetLines(network, target)) {
          effects.push({ kind: 'lineFrequencyFactor', line, factor: p.lineFrequency[sev] });
        }
      }
      break;
    }
    case 'station_closure': {
      if (target.kind !== 'station') break;
      effects.push({ kind: 'stationClosed', stationId: target.stationId, passThrough: !spec.options?.stopTraffic });
      if (spec.options?.stopTraffic) {
        for (const [segmentId] of affectedSegments(network, target, 0)) effects.push({ kind: 'segmentClosed', segmentId });
      }
      break;
    }
    case 'segment_interruption': {
      for (const [segmentId] of affectedSegments(network, target, 0)) effects.push({ kind: 'segmentClosed', segmentId });
      break;
    }
    case 'technical_failure': {
      const p = EFFECT_PARAMETERS.technical_failure;
      for (const [segmentId, h] of affectedSegments(network, target, spec.radius)) {
        effects.push({ kind: 'segmentSpeedFactor', segmentId, factor: round(1 + (p.speed[sev] - 1) * decay(h)) });
        effects.push({ kind: 'segmentCapacityFactor', segmentId, factor: round(1 - (1 - p.capacity[sev]) * decay(h)) });
      }
      break;
    }
    case 'line_slowdown': {
      for (const line of targetLines(network, target)) {
        effects.push({ kind: 'lineSpeedFactor', line, factor: EFFECT_PARAMETERS.line_slowdown.speed[sev] });
      }
      break;
    }
    case 'frequency_reduction': {
      for (const line of targetLines(network, target)) {
        effects.push({ kind: 'lineFrequencyFactor', line, factor: EFFECT_PARAMETERS.frequency_reduction.frequency[sev] });
      }
      break;
    }
    case 'major_delay': {
      const p = EFFECT_PARAMETERS.major_delay;
      for (const [segmentId, h] of affectedSegments(network, target, spec.radius)) {
        effects.push({ kind: 'segmentTimeAdd', segmentId, seconds: Math.round(p.timeAdd[sev] * decay(h)) });
        effects.push({ kind: 'segmentCapacityFactor', segmentId, factor: round(1 - (1 - p.capacity[sev]) * decay(h)) });
      }
      break;
    }
    case 'crowd_surge': {
      if (target.kind !== 'station') break;
      const f = EFFECT_PARAMETERS.crowd_surge.demand[sev];
      effects.push({ kind: 'demandFactor', stationId: target.stationId, factor: f });
      if (spec.radius > 0) {
        const near = new Map<string, number>();
        for (const [segId, h] of affectedSegments(network, target, spec.radius - 1)) {
          const seg = network.segmentById.get(segId)!;
          for (const s of [seg.a, seg.b]) {
            if (s !== target.stationId) near.set(s, Math.min(h + 1, near.get(s) ?? Infinity));
          }
        }
        for (const [stationId, h] of near) {
          effects.push({ kind: 'demandFactor', stationId, factor: round(1 + (f - 1) * decay(h)) });
        }
      }
      break;
    }
    case 'transfer_incident': {
      if (target.kind !== 'station') break;
      effects.push({ kind: 'transferPenalty', stationId: target.stationId, seconds: EFFECT_PARAMETERS.transfer_incident.penalty[sev] });
      break;
    }
    case 'return_to_normal':
      break;
  }
  return effects;
}

export function describeTarget(network: Network, target: IncidentTarget): string {
  switch (target.kind) {
    case 'station': {
      const st = network.stationById.get(target.stationId);
      return `${st?.name ?? target.stationId}${target.line ? ` (ligne ${target.line})` : ''}`;
    }
    case 'segment': {
      const seg = network.segmentById.get(target.segmentId);
      if (!seg) return target.segmentId;
      return `L${seg.line} ${network.stationById.get(seg.a)?.name} ↔ ${network.stationById.get(seg.b)?.name}`;
    }
    case 'line':
      return `Ligne ${target.line}`;
    default:
      return 'Tout le réseau';
  }
}

export function describeEffect(network: Network, e: IncidentEffect): string {
  const segName = (id: string) => {
    const seg = network.segmentById.get(id);
    return seg ? `${network.stationById.get(seg.a)?.name} ↔ ${network.stationById.get(seg.b)?.name} (L${seg.line})` : id;
  };
  const stName = (id: string) => network.stationById.get(id)?.name ?? id;
  switch (e.kind) {
    case 'segmentTimeAdd':
      return `+${Math.round(e.seconds)} s de parcours : ${segName(e.segmentId)}`;
    case 'segmentSpeedFactor':
      return `Temps de parcours ×${e.factor} : ${segName(e.segmentId)}`;
    case 'segmentCapacityFactor':
      return `Capacité ×${e.factor} : ${segName(e.segmentId)}`;
    case 'segmentClosed':
      return `Tronçon interrompu : ${segName(e.segmentId)}`;
    case 'stationClosed':
      return `Station fermée : ${stName(e.stationId)}${e.passThrough ? ' (trains sans arrêt)' : ''}`;
    case 'lineFrequencyFactor':
      return `Fréquence ligne ${e.line} ×${e.factor}`;
    case 'lineSpeedFactor':
      return `Temps de parcours ligne ${e.line} ×${e.factor}`;
    case 'demandFactor':
      return `Demande ×${e.factor} : ${stName(e.stationId)}`;
    case 'transferPenalty':
      return e.seconds === null
        ? `Correspondances impossibles : ${stName(e.stationId)}`
        : `Correspondance +${e.seconds} s : ${stName(e.stationId)}`;
  }
}

/** Indique si un incident concerne la cible d'un « retour à la normale ». */
export function incidentMatchesTarget(network: Network, incident: Incident, target: IncidentTarget): boolean {
  if (target.kind === 'network') return true;
  if (target.kind === 'line') {
    return targetLines(network, incident.target).includes(target.line) && incident.target.kind !== 'network';
  }
  if (target.kind === 'segment') {
    return incident.target.kind === 'segment' && incident.target.segmentId === target.segmentId;
  }
  // Station : incidents sur la station ou sur un tronçon adjacent.
  if (incident.target.kind === 'station') return incident.target.stationId === target.stationId;
  if (incident.target.kind === 'segment') {
    const seg = network.segmentById.get(incident.target.segmentId);
    return !!seg && (seg.a === target.stationId || seg.b === target.stationId);
  }
  return false;
}

export function validateIncidentSpec(network: Network, spec: IncidentSpec): string | null {
  const info = INCIDENT_TYPE_INFO[spec.type];
  if (!info) return `Type d'incident inconnu : ${spec.type}`;
  if (!info.targets.includes(spec.target.kind)) return `Cible « ${spec.target.kind} » non valide pour « ${info.label} »`;
  if (spec.target.kind === 'station' && !network.stationById.has(spec.target.stationId)) {
    return `Station indisponible dans cette version du réseau : ${spec.target.stationId}`;
  }
  if (spec.target.kind === 'station' && spec.target.line) {
    const st = network.stationById.get(spec.target.stationId)!;
    if (!st.lines.includes(spec.target.line)) return `La ligne ${spec.target.line} ne dessert pas ${st.name}`;
  }
  if (spec.target.kind === 'segment' && !network.segmentById.has(spec.target.segmentId)) {
    return `Tronçon inconnu : ${spec.target.segmentId}`;
  }
  if (spec.target.kind === 'line' && !network.lineById.has(spec.target.line)) return `Ligne inconnue : ${spec.target.line}`;
  if (![1, 2, 3].includes(spec.severity)) return 'Gravité invalide';
  if (spec.radius < 0 || spec.radius > 5) return "Rayon d'impact invalide (0 à 5)";
  if (spec.duration !== null && spec.type !== 'return_to_normal' && !(spec.duration > 0)) return 'Durée invalide';
  return null;
}
