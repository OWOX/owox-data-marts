export interface PathPoint {
  x: number;
  y: number;
}

function segmentLength(a: PathPoint, b: PathPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointAtDistance(from: PathPoint, to: PathPoint, distance: number): PathPoint {
  const length = segmentLength(from, to);
  if (length === 0) return from;
  const t = distance / length;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export function buildRoundedPath(points: PathPoint[], radius: number): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    const [a, b] = points;
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }

  const [first, ...rest] = points;
  let path = `M ${first.x} ${first.y}`;
  let cursor = first;

  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const next = points[i + 1];
    const prevLen = segmentLength(cursor, corner);
    const nextLen = segmentLength(corner, next);
    const r = Math.max(0, Math.min(radius, prevLen / 2, nextLen / 2));

    const cornerStart = r === 0 ? corner : pointAtDistance(corner, cursor, r);
    const cornerEnd = r === 0 ? corner : pointAtDistance(corner, next, r);

    path += ` L ${cornerStart.x} ${cornerStart.y}`;
    path += ` Q ${corner.x} ${corner.y}, ${cornerEnd.x} ${cornerEnd.y}`;
    cursor = cornerEnd;
  }

  const last = rest[rest.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}
