export type CanvasDirection = 'horizontal' | 'vertical';

export const CANVAS_DIRECTION_OPTIONS: { value: CanvasDirection; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
];

export function parseCanvasDirection(value: unknown): CanvasDirection {
  return value === 'vertical' ? 'vertical' : 'horizontal';
}
