/**
 * Fil d'info trafic : transforme les événements du moteur en messages courts, dans le style
 * des notifications reçues par les voyageurs (comptes fictifs, contenus simulés).
 */
import type { Incident } from '@/types/incident';
import type { LineId, Network } from '@/types/network';
import type { SimEvent } from '@/types/simulation';
import { fmtClock } from './metrics';

export type PostTone = 'alert' | 'ok' | 'info' | 'crowd' | 'night' | 'player';

export interface FeedPost {
  id: number;
  time: number;
  /** Ligne émettrice (compte « Ligne X ») ; absent = compte réseau. */
  line?: LineId;
  author: 'line' | 'network' | 'player';
  tone: PostTone;
  text: string;
  tags: string[];
  incidentId?: string;
  stationId?: string;
  /** Concerne une ligne gérée par le joueur (mis en avant). */
  mine: boolean;
}

/** Délai minimal (s simulées) entre deux alertes d'affluence pour la même station ou ligne. */
const CROWD_COOLDOWN = 30 * 60;

export class FeedBuilder {
  private lastCrowd = new Map<string, number>();
  constructor(private readonly network: Network) {}

  reset() {
    this.lastCrowd.clear();
  }

  /** Message pour un événement (null si l'événement ne mérite pas de publication). */
  build(ev: SimEvent, incidents: Incident[], managed: LineId[] | null): FeedPost | null {
    const net = this.network;
    const isMine = (lines: LineId[]) => !managed || lines.some((l) => managed.includes(l));
    const base = { id: ev.id, time: ev.time, incidentId: ev.incidentId, stationId: ev.stationId };
    const lineTag = (l: LineId) => `#Ligne${l}`;

    switch (ev.kind) {
      case 'incident.start':
      case 'incident.end':
      case 'incident.update': {
        const inc = incidents.find((i) => i.id === ev.incidentId);
        if (!inc) return null;
        const lines = incidentLines(net, inc);
        const line = lines[0];
        const where = describeWhere(net, inc);
        let text: string;
        let tone: PostTone;
        if (ev.kind === 'incident.start') {
          tone = 'alert';
          const until = inc.duration !== null ? ` Reprise estimée vers ${fmtClock(inc.startTime + inc.duration)}.` : ' Durée indéterminée.';
          text = startText(inc, where, net) + until;
          const alt = alternatives(net, inc, line);
          if (alt.length && (inc.type === 'segment_interruption' || inc.type === 'station_closure' || inc.severity === 3)) {
            text += ` Itinéraires conseillés : ligne${alt.length > 1 ? 's' : ''} ${alt.join(', ')}.`;
          }
        } else if (ev.kind === 'incident.end') {
          tone = 'ok';
          text = `✅ Le trafic est rétabli ${where.short}. Merci de votre patience.`;
        } else {
          if (!/prolong/i.test(ev.message)) return null;
          tone = 'alert';
          const end = inc.duration !== null ? fmtClock(inc.startTime + inc.duration) : null;
          text = `⏳ L'incident ${where.short} se prolonge.${end ? ` Nouvelle reprise estimée vers ${end}.` : ''}`;
        }
        return { ...base, line, author: line ? 'line' : 'network', tone, text, tags: [...lines.map(lineTag), tone === 'ok' ? '#TraficRétabli' : '#InfoTrafic'], mine: isMine(lines) };
      }
      case 'service':
        return {
          ...base,
          author: 'network',
          tone: /ferme/.test(ev.message) ? 'night' : 'info',
          text: /ferme/.test(ev.message)
            ? '🌙 Fin de service : le métro ferme pour la nuit. Réouverture à 5 h 30. Bonne nuit !'
            : /Ouverture/.test(ev.message)
              ? '☀️ Ouverture du réseau : premiers trains sur toutes les lignes. Bonne journée !'
              : `🕒 ${ev.message}.`,
          tags: ['#Métro'],
          mine: true,
        };
      case 'regulation':
        if (!ev.line) return { ...base, author: 'player', tone: 'player', text: `🎛️ ${ev.message}.`, tags: ['#Régulation'], mine: true };
        return {
          ...base,
          line: ev.line,
          author: 'player',
          tone: 'player',
          text: /réserve/.test(ev.message)
            ? `🚇 Renfort sur la ligne ${ev.line} : ${ev.message.replace(/^Ligne \S+ : /, '')}.`
            : `🎛️ Ligne ${ev.line} : ${ev.message.replace(/^Ligne \S+ : /, '')}.`,
          tags: [lineTag(ev.line), '#Régulation'],
          mine: isMine([ev.line]),
        };
      case 'station.closed':
      case 'station.opened':
      case 'segment.closed':
      case 'segment.opened': {
        const st = ev.stationId ? net.stationById.get(ev.stationId) : undefined;
        const seg = ev.segmentId ? net.segmentById.get(ev.segmentId) : undefined;
        const lines = st ? st.lines : seg ? [seg.line] : [];
        const closed = ev.kind.endsWith('closed');
        return {
          ...base,
          line: lines.length === 1 ? lines[0] : undefined,
          author: 'player',
          tone: closed ? 'alert' : 'ok',
          text: `${closed ? '⛔' : '✅'} ${ev.message}.`,
          tags: lines.map(lineTag),
          mine: isMine(lines),
        };
      }
      case 'alert.station': {
        const st = ev.stationId ? net.stationById.get(ev.stationId) : undefined;
        if (!st || !isMine(st.lines) || !this.cool(`s:${st.id}`, ev.time)) return null;
        const n = /(\d[\d\s]*) voyageurs/.exec(ev.message)?.[1]?.replace(/\s/g, '');
        return {
          ...base,
          line: st.lines.length === 1 ? st.lines[0] : undefined,
          author: st.lines.length === 1 ? 'line' : 'network',
          tone: 'crowd',
          text: `👥 Forte affluence à ${st.name}${n ? ` (${Number(n).toLocaleString('fr-FR')} voyageurs sur les quais)` : ''}. Laissez descendre avant de monter et répartissez-vous sur le quai.`,
          tags: [...st.lines.map(lineTag), '#Affluence'],
          mine: true,
        };
      }
      case 'alert.segment': {
        const seg = ev.segmentId ? net.segmentById.get(ev.segmentId) : undefined;
        if (!seg || !managed || !managed.includes(seg.line) || !this.cool(`l:${seg.line}`, ev.time)) return null;
        const a = net.stationById.get(seg.a)!.name;
        const b = net.stationById.get(seg.b)!.name;
        return {
          ...base,
          line: seg.line,
          author: 'line',
          tone: 'crowd',
          text: `🔴 Trains très chargés entre ${a} et ${b}. Pensez à renforcer la fréquence de la ligne ${seg.line}.`,
          tags: [lineTag(seg.line), '#Affluence'],
          mine: true,
        };
      }
      default:
        return null;
    }
  }

  private cool(key: string, time: number): boolean {
    const last = this.lastCrowd.get(key);
    if (last !== undefined && time - last < CROWD_COOLDOWN) return false;
    this.lastCrowd.set(key, time);
    return true;
  }
}

/** Lignes concernées par un incident. */
export function incidentLines(net: Network, inc: Incident): LineId[] {
  const t = inc.target;
  if (t.kind === 'line') return [t.line];
  if (t.kind === 'segment') {
    const seg = net.segmentById.get(t.segmentId);
    return seg ? [seg.line] : [];
  }
  if (t.kind === 'station') {
    if (t.line) return [t.line];
    return net.stationById.get(t.stationId)?.lines ?? [];
  }
  return [];
}

interface Where {
  /** « entre A et B », « à Station », « sur la ligne 4 ». */
  short: string;
  station?: string;
}

function neighbours(net: Network, stationId: string, line: LineId): string[] {
  const out: string[] = [];
  for (const seg of net.segments) {
    if (seg.line !== line) continue;
    if (seg.a === stationId) out.push(seg.b);
    else if (seg.b === stationId) out.push(seg.a);
  }
  return out.map((id) => net.stationById.get(id)!.name);
}

function describeWhere(net: Network, inc: Incident): Where {
  const t = inc.target;
  if (t.kind === 'line') return { short: `sur la ligne ${t.line}` };
  if (t.kind === 'segment') {
    const seg = net.segmentById.get(t.segmentId);
    if (!seg) return { short: '' };
    return { short: `entre ${net.stationById.get(seg.a)!.name} et ${net.stationById.get(seg.b)!.name}` };
  }
  if (t.kind === 'station') {
    const st = net.stationById.get(t.stationId);
    if (!st) return { short: '' };
    return { short: `à ${st.name}`, station: st.name };
  }
  return { short: 'sur le réseau' };
}

function startText(inc: Incident, where: Where, net: Network): string {
  const t = inc.target;
  let between = where.short;
  if (t.kind === 'station' && t.line) {
    const n = neighbours(net, t.stationId, t.line);
    if (n.length >= 2) between = `entre ${n[0]} et ${n[1]}`;
  }
  switch (inc.type) {
    case 'malaise':
      return `🚑 Trafic ralenti ${between} en raison d'un malaise voyageur ${where.short}.`;
    case 'station_closure':
      return `⛔ La station ${where.station ?? ''} est fermée. Les trains ne marquent pas l'arrêt.`;
    case 'segment_interruption':
      return `🚫 Trafic interrompu ${where.short}.`;
    case 'technical_failure':
      return `🔧 Trafic perturbé ${between} en raison d'une panne technique ${where.short}.`;
    case 'line_slowdown':
      return `🐢 Trafic ralenti ${where.short}. Temps de trajet allongés.`;
    case 'frequency_reduction':
      return `⏱️ Fréquence réduite ${where.short} : temps d'attente allongés.`;
    case 'major_delay':
      return `⚠️ Trafic fortement perturbé ${where.short}. Prévoyez un temps de trajet supplémentaire.`;
    case 'crowd_surge':
      return `👥 Affluence exceptionnelle attendue ${where.short}. Évitez si possible ce secteur.`;
    case 'transfer_incident':
      return `↔️ Correspondances perturbées ${where.short}.`;
    default:
      return `⚠️ Incident ${where.short}.`;
  }
}

/** Autres lignes desservant les extrémités du secteur touché (itinéraires de délestage). */
function alternatives(net: Network, inc: Incident, line: LineId | undefined): LineId[] {
  const t = inc.target;
  const stations: string[] = [];
  if (t.kind === 'station') {
    stations.push(t.stationId);
    // Gare isolée sur sa ligne : on propose aussi les lignes des stations voisines.
    if (line) for (const seg of net.segments) if (seg.line === line && (seg.a === t.stationId || seg.b === t.stationId)) stations.push(seg.a === t.stationId ? seg.b : seg.a);
  }
  if (t.kind === 'segment') {
    const seg = net.segmentById.get(t.segmentId);
    if (seg) stations.push(seg.a, seg.b);
  }
  const out = new Set<LineId>();
  for (const id of stations) for (const l of net.stationById.get(id)?.lines ?? []) if (l !== line) out.add(l);
  return [...out].slice(0, 3);
}
