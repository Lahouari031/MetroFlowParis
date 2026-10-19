/** Création du Web Worker de simulation (version Next.js). Retourne null si indisponible. */
export function createSimWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}
