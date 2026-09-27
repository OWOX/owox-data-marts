/**
 * How many chips of these widths fit in a row `available` pixels wide. Once they do not all
 * fit, room is kept for the overflow button that holds the rest.
 */
export function countChipsThatFit(
  widths: number[],
  available: number,
  gap: number,
  overflowWidth: number
): number {
  const all = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  if (all <= available) return widths.length;
  let used = overflowWidth;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width;
    count += 1;
  }
  return count;
}
