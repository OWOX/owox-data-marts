import { useCallback } from 'react';
import {
  useMarkdownPreviewInternal,
  type UseMarkdownPreviewProps,
} from './useMarkdownPreviewInternal.ts';
import { parseMarkdownToHtml } from '../../services/markdown.service';

/**
 * App-level adapter hook that wires the backend Markdown→HTML converter
 * into the headless useMarkdownPreview hook with a stable reference.
 */
export function useMarkdownPreview(props: Omit<UseMarkdownPreviewProps, 'toHtml'>) {
  const toHtml = useCallback(parseMarkdownToHtml, []);
  return useMarkdownPreviewInternal({ ...props, toHtml });
}
