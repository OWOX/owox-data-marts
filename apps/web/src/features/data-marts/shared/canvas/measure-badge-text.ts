/** Font size of the text inside a canvas card badge (`text-[11px]`). */
export const CARD_BADGE_FONT_SIZE_PX = 11;

/** Per-character width when no canvas is available (tests, SSR); errs wide. */
const FALLBACK_CHAR_WIDTH_PX = 6.5;

let context: CanvasRenderingContext2D | null | undefined;
let font: string | undefined;
const widths = new Map<string, number>();

function getContext(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return context;
}

/**
 * Rendered width of a badge's text in the card's own font, so the layout can
 * tell which badges share a line before React renders them.
 */
export function measureBadgeText(text: string): number {
  const cached = widths.get(text);
  if (cached !== undefined) return cached;
  const ctx = getContext();
  let width: number;
  if (ctx) {
    font ??= `${String(CARD_BADGE_FONT_SIZE_PX)}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    ctx.font = font;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * FALLBACK_CHAR_WIDTH_PX;
  }
  widths.set(text, width);
  return width;
}
