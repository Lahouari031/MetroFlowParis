/** Comparaison superficielle des props « v » pour React.memo (les objets visuels sont recréés à chaque rendu). */
export function sameVisual<P extends { v: object }>(a: P, b: P): boolean {
  for (const k of Object.keys(b) as (keyof P)[]) {
    if (k === 'v') continue;
    if (a[k] !== b[k]) return false;
  }
  const va = a.v as Record<string, unknown>;
  const vb = b.v as Record<string, unknown>;
  for (const k of Object.keys(vb)) if (va[k] !== vb[k]) return false;
  return true;
}
