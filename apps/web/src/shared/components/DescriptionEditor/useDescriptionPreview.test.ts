import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { addDataMartLinkIcons, useDescriptionPreview } from './useDescriptionPreview';
import { parseMarkdownToHtml } from '../../services/markdown.service';

const references = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./useDataMartReferences', () => ({ useDataMartReferences: () => references.load }));
vi.mock('../../services/markdown.service', () => ({ parseMarkdownToHtml: vi.fn() }));

describe('description Data Mart link icons', () => {
  it('decorates accessible project links including field references and preserves their labels', async () => {
    const load = vi.fn().mockResolvedValue([{ id: 'orders', title: 'Orders', icon: 'purchases' }]);
    const html = await addDataMartLinkIcons(
      '<p><a href="https://app.example/ui/project/data-marts/orders/data-setup?field=total">Orders · Total</a></p>',
      'project',
      'https://app.example',
      load
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('a')?.textContent).toBe('Orders · Total');
    expect(doc.querySelector('a > svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(doc.querySelector('a')?.getAttribute('href')).toContain('?field=total');
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not fetch for external or other-project links, and does not decorate inaccessible marts', async () => {
    const load = vi.fn().mockResolvedValue([]);
    const unrelated =
      '<a href="https://other.example/ui/project/data-marts/id/data-setup">Other site</a><a href="/ui/other/data-marts/id/data-setup">Other project</a>';
    expect(await addDataMartLinkIcons(unrelated, 'project', 'https://app.example', load)).toBe(
      unrelated
    );
    expect(load).not.toHaveBeenCalled();
    const inaccessible = '<a href="/ui/project/data-marts/id/data-setup">Private</a>';
    expect(
      await addDataMartLinkIcons(inaccessible, 'project', 'https://app.example', load)
    ).not.toContain('<svg');
  });

  it('keeps sanitized HTML readable if the catalog cannot load', async () => {
    const html = '<a href="/ui/project/data-marts/id/data-setup">Orders</a>';
    expect(
      await addDataMartLinkIcons(html, 'project', 'https://app.example', () =>
        Promise.reject(new Error('offline'))
      )
    ).toBe(html);
  });

  it('preserves the backend theme styles while adding icons', async () => {
    const html =
      '<style>@media(prefers-color-scheme:dark){.markdown-body{color:white}}</style><div class="markdown-body"><a href="/ui/project/data-marts/id/data-setup">Orders</a></div>';
    const result = await addDataMartLinkIcons(html, 'project', 'https://app.example', () =>
      Promise.resolve([{ id: 'id', title: 'Orders' }])
    );
    expect(result).toContain('<style>@media');
    expect(result).toContain('<svg');
  });

  it('renders sanitized Markdown before the catalog loads and ignores stale decoration after edits', async () => {
    const html = '<p><a href="/ui/project/data-marts/orders/data-setup">Orders</a></p>';
    vi.mocked(parseMarkdownToHtml)
      .mockResolvedValueOnce(html)
      .mockResolvedValueOnce('<p>New description</p>');
    let complete!: (value: { id: string; title: string }[]) => void;
    references.load.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = resolve;
        })
    );
    const hook = renderHook(
      ({ markdown }) => useDescriptionPreview({ markdown, projectId: 'project', debounceMs: 0 }),
      { initialProps: { markdown: '[Orders](link)' } }
    );
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.html).toBe(html);
    });
    expect(references.load).toHaveBeenCalled();
    hook.rerender({ markdown: 'New description' });
    await waitFor(() => {
      expect(hook.result.current.html).toBe('<p>New description</p>');
    });
    await act(async () => {
      complete([{ id: 'orders', title: 'Orders' }]);
    });
    expect(hook.result.current.html).toBe('<p>New description</p>');
  });
});
