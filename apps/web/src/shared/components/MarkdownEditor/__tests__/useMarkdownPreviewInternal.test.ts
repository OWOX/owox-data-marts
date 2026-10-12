import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMarkdownPreviewInternal } from '../useMarkdownPreviewInternal';

describe('useMarkdownPreviewInternal', () => {
  it('does not replace the current preview with a late result from an aborted request', async () => {
    const pending: ((html: string) => void)[] = [];
    const toHtml = vi.fn(
      () =>
        new Promise<string>(resolve => {
          pending.push(resolve);
        })
    );
    const hook = renderHook(
      ({ markdown }) => useMarkdownPreviewInternal({ markdown, toHtml, debounceMs: 0 }),
      {
        initialProps: { markdown: 'Old description' },
      }
    );
    await waitFor(() => {
      expect(toHtml).toHaveBeenCalledTimes(1);
    });
    hook.rerender({ markdown: 'New description' });
    await waitFor(() => {
      expect(toHtml).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      pending[1]('<p>New description</p>');
    });
    expect(hook.result.current.html).toBe('<p>New description</p>');
    await act(async () => {
      pending[0]('<p>Old description</p>');
    });
    expect(hook.result.current.html).toBe('<p>New description</p>');
  });
});
