import { cn } from '@owox/ui/lib/utils';

/**
 * Renders an assistant chat turn from the sanitized HTML fragment the backend
 * produced (MarkdownParser.parseToFragment → remark + GFM + rehype-sanitize).
 *
 * `dangerouslySetInnerHTML` is safe HERE — and ONLY here — because the HTML was
 * sanitized server-side by rehype-sanitize before it ever reached the client.
 * Never pass client-authored or un-sanitized markup to this component; render
 * those through ChatMarkdown (which builds React nodes and cannot inject HTML).
 *
 * The fragment is intentionally style-free (no inlined GitHub CSS, no <style>
 * block), so we style it locally with scoped Tailwind arbitrary variants — the
 * bubble keeps the app's design system instead of importing GitHub's.
 */
export function ChatMarkdownHtml({ html }: { html: string }) {
  return (
    <div
      data-testid='ai-msg-html'
      className={cn(
        'space-y-2 text-sm leading-relaxed break-words',
        '[&_p]:whitespace-pre-wrap',
        '[&_strong]:font-semibold',
        '[&_a]:underline',
        '[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold',
        '[&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
        '[&_pre]:bg-muted [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:p-2',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:block [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-x-auto [&_table]:text-xs',
        '[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top'
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
