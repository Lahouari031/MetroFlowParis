/** Création du Web Worker de simulation (version autonome : worker.js à côté de la page). */
export function createSimWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined' || location.protocol === 'file:') return null;
    return new Worker(new URL('worker.js', document.baseURI));
  } catch {
    return null;
  }
}
