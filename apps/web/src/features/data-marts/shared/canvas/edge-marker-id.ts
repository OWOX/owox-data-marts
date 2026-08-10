/** SVG marker ids must be safe inside url(#…) — collapse everything else to '_'. */
export function edgeMarkerId(prefix: string, edgeId: string): string {
  return `${prefix}-${edgeId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
