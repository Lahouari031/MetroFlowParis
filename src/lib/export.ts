/** Export des résultats de simulation (CSV / JSON) et téléchargement côté navigateur. */
import type { Incident } from '@/types/incident';
import type { RunSummary } from '@/types/scenario';
import type { HistoryPoint, SimAction } from '@/types/simulation';
import { timeLabel } from '@/engine/simulationEngine';

const csvEscape = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Historique minute par minute au format CSV (séparateur « ; », compatible tableurs français). */
export function historyToCsv(history: HistoryPoint[], reference?: HistoryPoint[] | null): string {
  const lines = history.length ? Object.keys(history[0].lineSaturation) : [];
  const header = [
    'heure',
    'voyageurs_reseau',
    'voyageurs_en_attente',
    'entrees_par_heure',
    'saturation_moyenne',
    'troncons_satures',
    'retard_moyen_min',
    'attente_moyenne_min',
    'voyageurs_affectes_cumul',
    'incidents_actifs',
    'qualite_service',
    'cout_operationnel_keur',
    ...lines.map((l) => `saturation_ligne_${l}`),
    ...(reference ? ['ref_voyageurs_reseau', 'ref_troncons_satures', 'ref_retard_moyen_min'] : []),
  ];
  const rows = history.map((h) => {
    const r = reference?.find((x) => x.time === h.time);
    return [
      timeLabel(h.time),
      h.inNetwork.toFixed(0),
      h.waiting.toFixed(0),
      h.entriesPerHour.toFixed(0),
      h.avgSaturation.toFixed(3),
      h.saturatedSegments,
      (h.avgDelay / 60).toFixed(2),
      (h.avgWait / 60).toFixed(2),
      h.affectedTotal.toFixed(0),
      h.activeIncidents,
      h.serviceQuality.toFixed(1),
      h.operatingCost.toFixed(1),
      ...lines.map((l) => h.lineSaturation[l as keyof typeof h.lineSaturation].toFixed(3)),
      ...(reference ? [r ? r.inNetwork.toFixed(0) : '', r ? r.saturatedSegments : '', r ? (r.avgDelay / 60).toFixed(2) : ''] : []),
    ]
      .map(csvEscape)
      .join(';');
  });
  return [header.join(';'), ...rows].join('\n');
}

export interface RunExport {
  generator: 'MétroFlow Paris';
  disclaimer: string;
  exportedAt: string;
  scenario: string;
  seed: number;
  summary?: RunSummary;
  history: HistoryPoint[];
  referenceHistory?: HistoryPoint[] | null;
  incidents: Incident[];
  actions: SimAction[];
}

export const DISCLAIMER =
  'Données générées par une simulation expérimentale (demande synthétique). Il ne s’agit pas de mesures RATP ou Île-de-France Mobilités.';

export function runToJson(data: Omit<RunExport, 'generator' | 'disclaimer' | 'exportedAt'>): string {
  const payload: RunExport = { generator: 'MétroFlow Paris', disclaimer: DISCLAIMER, exportedAt: new Date().toISOString(), ...data };
  return JSON.stringify(payload, null, 2);
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
