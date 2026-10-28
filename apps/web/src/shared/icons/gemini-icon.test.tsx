import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GeminiIcon } from './gemini-icon';

describe('GeminiIcon', () => {
  it('fills each instance with its own gradient', () => {
    const { container } = render(
      <>
        <GeminiIcon />
        <GeminiIcon />
      </>
    );
    const ids = [...container.querySelectorAll('linearGradient')].map(gradient => gradient.id);

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
    container.querySelectorAll('svg').forEach((svg, index) => {
      expect(svg.querySelector('path')).toHaveAttribute('fill', `url(#${ids[index]})`);
    });
  });
});
