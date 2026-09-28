/** Canvas card display density, shared by the Models canvas and the Joinable Data Marts diagram. */
export type CanvasViewMode = 'compact' | 'erd';

export const VIEW_MODE_OPTIONS: { value: CanvasViewMode; label: string }[] = [
  { value: 'compact', label: 'Compact mode' },
  { value: 'erd', label: 'ERD' },
];

export function parseCanvasViewMode(value: unknown): CanvasViewMode {
  return value === 'erd' ? 'erd' : 'compact';
}
