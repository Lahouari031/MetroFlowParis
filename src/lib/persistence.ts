/**
 * Persistance locale (localStorage). Chaque clé est versionnée ; les données sont validées
 * au chargement et les erreurs sont remontées à l'interface au lieu d'être masquées.
 *
 * Pour passer à une base distante (PostgreSQL, Supabase…), il suffit de fournir une autre
 * implémentation de StorageBackend : le reste de l'application n'accède au stockage que via ce module.
 */
import type { ChallengeProgress, RecordedRun, SavedScenario } from '@/types/scenario';
import type { SimAction, SimulationConfig } from '@/types/simulation';

export const SCHEMA_VERSION = 1;
const PREFIX = 'metroflow:v1:';

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

class LocalStorageBackend implements StorageBackend {
  get(key: string) {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  }
  remove(key: string) {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    } catch {
      /* stockage indisponible */
    }
  }
}

let backend: StorageBackend = new LocalStorageBackend();

/** Remplace le stockage (tests, futur backend distant). */
export function setStorageBackend(b: StorageBackend) {
  backend = b;
}

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
  }
}

function readJson<T>(key: string, fallback: T): { value: T; error: string | null } {
  const raw = backend.get(PREFIX + key);
  if (raw === null) return { value: fallback, error: null };
  try {
    return { value: JSON.parse(raw) as T, error: null };
  } catch {
    return { value: fallback, error: `Données locales illisibles (${key}) : elles ont été ignorées.` };
  }
}

function writeJson(key: string, value: unknown): string | null {
  try {
    backend.set(PREFIX + key, JSON.stringify(value));
    return null;
  } catch (e) {
    return `Échec de l'enregistrement local (${key}) : ${e instanceof Error ? e.message : String(e)}`;
  }
}

/* ------------------------------------------------------------------ réglages */

export function loadSettings<T>(fallback: T): { value: T; error: string | null } {
  const { value, error } = readJson<Partial<T>>('settings-v2', {});
  return { value: { ...fallback, ...(value && typeof value === 'object' ? value : {}) }, error };
}

export function saveSettings(value: unknown): string | null {
  return writeJson('settings-v2', value);
}

/* ------------------------------------------------------------------ scénarios sauvegardés */

export interface ValidationContext {
  fingerprint: string;
  stationIds: Set<string>;
  segmentIds: Set<string>;
  lineIds: Set<string>;
}

/** Vérifie la structure et la compatibilité d'un scénario sauvegardé. Retourne une liste d'erreurs. */
export function validateSavedScenario(raw: unknown, ctx: ValidationContext): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Format invalide : objet attendu.'];
  const s = raw as Partial<SavedScenario>;
  if (s.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Version de sauvegarde incompatible (${String(s.schemaVersion)}, attendue ${SCHEMA_VERSION}).`);
    return errors;
  }
  if (typeof s.name !== 'string' || !s.name.trim()) errors.push('Nom manquant.');
  if (typeof s.id !== 'string') errors.push('Identifiant manquant.');
  const c = s.config as SimulationConfig | undefined;
  if (!c || typeof c !== 'object') errors.push('Configuration manquante.');
  else {
    for (const k of ['seed', 'startTime', 'duration', 'stepSeconds', 'demandScale'] as const) {
      if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) errors.push(`Paramètre invalide : ${k}.`);
    }
    if (!c.regulation || typeof c.regulation !== 'object') errors.push('Paramètres de régulation manquants.');
    else {
      for (const l of Object.keys(c.regulation.lines ?? {})) if (!ctx.lineIds.has(l)) errors.push(`Ligne inconnue : ${l}.`);
      for (const id of c.regulation.closedStations ?? []) if (!ctx.stationIds.has(id)) errors.push(`Station inconnue : ${id}.`);
      for (const id of c.regulation.disabledSegments ?? []) if (!ctx.segmentIds.has(id)) errors.push(`Tronçon inconnu : ${id}.`);
    }
  }
  if (!Array.isArray(s.actions)) errors.push("Journal d'actions manquant.");
  else {
    for (const a of s.actions as SimAction[]) {
      if (typeof a?.time !== 'number' || typeof a?.type !== 'string') {
        errors.push('Action mal formée dans le journal.');
        break;
      }
      const ref =
        'stationId' in a ? a.stationId : 'segmentId' in a ? a.segmentId : a.type === 'incident.create' && a.spec.target.kind === 'station' ? a.spec.target.stationId : null;
      if (ref && !ctx.stationIds.has(ref) && !ctx.segmentIds.has(ref)) errors.push(`Référence inconnue dans le journal : ${ref}.`);
    }
  }
  if (!Array.isArray(s.scheduled)) errors.push('Incidents programmés manquants.');
  if (errors.length === 0 && s.networkFingerprint !== ctx.fingerprint) {
    errors.push(
      'Cette sauvegarde a été créée avec une autre version des données du réseau. Elle peut être chargée seulement si toutes ses références existent encore.',
    );
  }
  return errors;
}

export function loadSavedScenarios(): { value: SavedScenario[]; error: string | null } {
  const r = readJson<SavedScenario[]>('saves', []);
  return { value: Array.isArray(r.value) ? r.value : [], error: r.error };
}

export function storeSavedScenarios(list: SavedScenario[]): string | null {
  return writeJson('saves', list);
}

/* ------------------------------------------------------------------ progression des défis */

export function loadProgress(): { value: Record<string, ChallengeProgress>; error: string | null } {
  return readJson<Record<string, ChallengeProgress>>('progress', {});
}

export function storeProgress(p: Record<string, ChallengeProgress>): string | null {
  return writeJson('progress', p);
}

/* ------------------------------------------------------------------ résultats enregistrés (comparaison) */

export function loadRuns(): { value: RecordedRun[]; error: string | null } {
  const r = readJson<RecordedRun[]>('runs', []);
  return { value: Array.isArray(r.value) ? r.value : [], error: r.error };
}

export function storeRuns(runs: RecordedRun[]): string | null {
  // Limite la taille : 8 simulations enregistrées au maximum.
  return writeJson('runs', runs.slice(-8));
}

export function clearAllLocalData() {
  for (const k of ['settings', 'settings-v2', 'saves', 'progress', 'runs']) backend.remove(PREFIX + k);
}
