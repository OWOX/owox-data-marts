import { describe, expect, it, vi } from 'vitest';
import { helpMenuItems } from './items';

describe('helpMenuItems', () => {
  it('does not offer a Slack Community link', () => {
    const items = helpMenuItems(vi.fn(), vi.fn());

    expect(items).not.toContainEqual(
      expect.objectContaining({
        type: 'menu-item',
        title: 'Slack Community',
      })
    );
  });
});
