import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalLoader } from './GlobalLoader';

function barWidth(container: HTMLElement) {
  return parseFloat((container.firstElementChild?.firstElementChild as HTMLElement).style.width);
}

describe('GlobalLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the given progress', () => {
    const { container } = render(<GlobalLoader isLoading progress={0.4} />);

    expect(barWidth(container)).toBe(40);
  });

  it('never moves back, and stops its own estimate while progress is given', () => {
    const { container, rerender } = render(<GlobalLoader isLoading />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const estimate = barWidth(container);
    expect(estimate).toBeGreaterThan(30);

    rerender(<GlobalLoader isLoading progress={0.05} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(barWidth(container)).toBe(estimate);

    rerender(<GlobalLoader isLoading progress={0.5} />);
    expect(barWidth(container)).toBe(50);

    rerender(<GlobalLoader isLoading />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(barWidth(container)).toBeGreaterThan(50);

    rerender(<GlobalLoader isLoading={false} />);
    expect(barWidth(container)).toBe(100);
  });
});
