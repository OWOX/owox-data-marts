import { createElement, useCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getDataMartIcon } from '../../../features/data-marts/shared/components/DataMartIcon/data-mart-icons';
import { isLucideIconValue } from '../../../features/data-marts/shared/components/DataMartIcon/lucide-icon-name';
import { loadLucideIconCatalog } from '../../../features/data-marts/shared/components/DataMartIcon/use-lucide-icon-catalog';
import { parseMarkdownToHtml } from '../../services/markdown.service';
import {
  useMarkdownPreviewInternal,
  type UseMarkdownPreviewProps,
} from '../MarkdownEditor/useMarkdownPreviewInternal';
import type { DataMartReference } from './data-mart-mentions';
import { useDataMartReferences } from './useDataMartReferences';

export async function addDataMartLinkIcons(
  html: string,
  projectId: string,
  origin: string,
  load: () => Promise<DataMartReference[]>
): Promise<string> {
  // Keep the backend's preserved Markdown theme styles in the fragment.
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(link => {
    try {
      const url = new URL(link.getAttribute('href') ?? '', origin);
      const prefix = `/ui/${encodeURIComponent(projectId)}/data-marts/`;
      if (url.origin !== origin || !url.pathname.startsWith(prefix)) return [];
      const path = url.pathname.slice(prefix.length).split('/');
      if (path.length !== 2 || path[1] !== 'data-setup') return [];
      return [{ link, id: decodeURIComponent(path[0]) }];
    } catch {
      return [];
    }
  });
  if (!links.length) return html;
  let references: DataMartReference[];
  try {
    references = await load();
  } catch {
    return html;
  }
  const byId = new Map(references.map(reference => [reference.id, reference]));
  let catalog: Awaited<ReturnType<typeof loadLucideIconCatalog>> | undefined;
  if (links.some(({ id }) => isLucideIconValue(byId.get(id)?.icon))) {
    try {
      catalog = await loadLucideIconCatalog();
    } catch {
      /* Draw the default icon. */
    }
  }
  for (const { link, id } of links) {
    const reference = byId.get(id);
    if (!reference) continue;
    const Icon = isLucideIconValue(reference.icon)
      ? (catalog?.getLucideIcon(reference.icon) ?? getDataMartIcon(null))
      : getDataMartIcon(reference.icon);
    // Only trusted library SVG is added to already sanitized Markdown HTML.
    const svg = renderToStaticMarkup(
      createElement(Icon, {
        width: 16,
        height: 16,
        'aria-hidden': true,
        style: { display: 'inline-block', verticalAlign: 'text-bottom', marginRight: 4 },
      })
    );
    link.insertAdjacentHTML('afterbegin', svg);
  }
  return document.body.innerHTML;
}

export function useDescriptionPreview({
  projectId,
  ...props
}: Omit<UseMarkdownPreviewProps, 'toHtml'> & { projectId: string }) {
  const load = useDataMartReferences(projectId);
  const toHtml = useCallback(
    async (markdown: string, signal?: AbortSignal) => {
      const html = await parseMarkdownToHtml(markdown, signal);
      if (signal?.aborted) return html;
      const decorated = await addDataMartLinkIcons(html, projectId, window.location.origin, load);
      if (signal?.aborted) return html;
      return decorated;
    },
    [projectId, load]
  );
  return useMarkdownPreviewInternal({ ...props, toHtml });
}
