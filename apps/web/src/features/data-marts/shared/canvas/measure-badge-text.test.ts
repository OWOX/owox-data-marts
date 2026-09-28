import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadMeasure() {
  vi.resetModules();
  return (await import('./measure-badge-text')).measureBadgeText;
}

describe('measureBadgeText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to 6.5 px per character without a canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const measureBadgeText = await loadMeasure();

    expect(measureBadgeText('2 reports')).toBe(58.5);
  });

  it('measures in the badge font and caches each text', async () => {
    const context = { font: '', measureText: vi.fn(() => ({ width: 42 })) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    document.body.style.fontFamily = 'Inter';
    const measureBadgeText = await loadMeasure();

    expect(measureBadgeText('1 relationship')).toBe(42);
    expect(measureBadgeText('1 relationship')).toBe(42);
    expect(context.font).toBe('11px Inter');
    expect(context.measureText).toHaveBeenCalledTimes(1);
  });
});
