'use client';

import { zoomIdentity } from 'd3-zoom';
import { useRef } from 'react';
import { mapCommands, useMapView } from '@/store/mapViewStore';

const W = 170;

/** Mini-carte de navigation : vue d'ensemble + rectangle de la zone visible (cliquer/glisser pour se déplacer). */
export function MiniMap({ content, paths, colors }: { content: { x: number; y: number; width: number; height: number }; paths: string[]; colors: string[] }) {
  const { k, x, y, width, height } = useMapView();
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const H = (W * content.height) / content.width;
  // Zone visible en coordonnées carte.
  const inv = zoomIdentity.translate(x, y).scale(k);
  const [vx0, vy0] = inv.invert([0, 0]);
  const [vx1, vy1] = inv.invert([width, height]);

  const moveTo = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const mx = content.x + ((clientX - r.left) / r.width) * content.width;
    const my = content.y + ((clientY - r.top) / r.height) * content.height;
    mapCommands.centerOn(mx, my, k);
  };

  return (
    <div className="absolute bottom-3 right-3 rounded-lg border border-edge bg-panel/90 p-1.5 shadow-lg backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <svg
        ref={ref}
        width={W}
        height={H}
        viewBox={`${content.x} ${content.y} ${content.width} ${content.height}`}
        className="cursor-crosshair"
        aria-label="Mini-carte de navigation"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          moveTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={colors[i]} strokeWidth={14} strokeLinecap="round" opacity={0.85} />
        ))}
        <rect
          x={vx0}
          y={vy0}
          width={Math.max(0, vx1 - vx0)}
          height={Math.max(0, vy1 - vy0)}
          fill="#38bdf8"
          fillOpacity={0.08}
          stroke="#38bdf8"
          strokeWidth={content.width / W}
        />
      </svg>
    </div>
  );
}
