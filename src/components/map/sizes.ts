/**
 * Tailles des éléments du plan en fonction du zoom : quasi constantes à l'écran (comme Mini Metro),
 * avec un léger grossissement en zoomant. Les valeurs renvoyées sont en unités de carte.
 */
export function mapSizes(k: number) {
  const t = Math.max(0, Math.min(1, (k - 0.35) / 1.65));
  const px = (from: number, to: number) => (from + (to - from) * t) / k;
  return {
    line: px(3.2, 6.5),
    halo: px(8, 15),
    hit: px(14, 18),
    station: px(3, 6.5),
    stationInterchange: px(4.2, 8.5),
    stroke: px(1.3, 2.2),
    labelFont: 12.5 / k,
    trainLength: px(7, 15),
    trainWidth: px(3.4, 6.5),
    trainOffset: px(1.8, 4.5),
    marker: px(11, 15) / 11,
    passenger: px(1.1, 2.2),
    passengerGap: px(3, 5.5),
  };
}

export type MapSizes = ReturnType<typeof mapSizes>;
