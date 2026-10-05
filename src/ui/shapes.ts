import type { NodeType } from '../types';
import { svg } from './dom';

/** Distinct silhouette per node type, so types are not told apart by colour alone. */
export function createShape(type: NodeType, r: number): SVGElement {
  switch (type) {
    case 'room':
      return svg('rect', {
        class: 'shape',
        x: -r,
        y: -r,
        width: 2 * r,
        height: 2 * r,
        rx: r * 0.3,
      });
    case 'junction':
      return svg('circle', { class: 'shape', r });
    case 'exit': {
      const rr = r * 1.12;
      const points = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i;
        return `${(Math.cos(angle) * rr).toFixed(2)},${(Math.sin(angle) * rr).toFixed(2)}`;
      }).join(' ');
      return svg('polygon', { class: 'shape', points });
    }
  }
}

/** Small corner badge: a cross for blocked, a bar for closed. Shown/hidden by CSS state classes. */
export function createBadges(r: number): SVGElement[] {
  const k = r * 0.2;
  const place = `translate(${r * 0.85} ${-r * 0.85})`;
  const blocked = svg(
    'g',
    { class: 'badge badge-blocked', transform: place },
    svg('circle', { r: r * 0.42 }),
    svg('path', { d: `M${-k} ${-k}L${k} ${k}M${k} ${-k}L${-k} ${k}` }),
  );
  const closed = svg(
    'g',
    { class: 'badge badge-closed', transform: place },
    svg('circle', { r: r * 0.42 }),
    svg('path', { d: `M${-k * 1.2} 0H${k * 1.2}` }),
  );
  return [blocked, closed];
}
