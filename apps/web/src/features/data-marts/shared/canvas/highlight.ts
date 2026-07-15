export interface CanvasHighlightState {
  highlighted: boolean;
  dimmed: boolean;
}

export const NO_HIGHLIGHT: CanvasHighlightState = { highlighted: false, dimmed: false };

export function computeCanvasHighlight<T>(
  items: T[],
  query: string,
  getId: (item: T) => string,
  getLabel: (item: T) => string
): Map<string, CanvasHighlightState> {
  const q = query.trim().toLowerCase();
  const state = new Map<string, CanvasHighlightState>();
  for (const item of items) {
    const highlighted = q !== '' && getLabel(item).toLowerCase().includes(q);
    state.set(getId(item), { highlighted, dimmed: q !== '' && !highlighted });
  }
  return state;
}
