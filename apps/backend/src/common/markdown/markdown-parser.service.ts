import { Injectable } from '@nestjs/common';
import juice from 'juice';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import {
  GITHUB_DARK_THEME_VARIABLES_CSS,
  GITHUB_DYNAMIC_THEME_VARIABLES_CSS,
  GITHUB_LIGHT_THEME_VARIABLES_CSS,
  GITHUB_MARKDOWN_CSS,
} from './github-markdown-css';
import remarkAlert from 'remark-github-blockquote-alert';
import { rehypeNormalizeTableTruncationNoticeRows } from './plugins/rehype-normalize-table-truncation-notice.plugin';

const EXTENDED_SCHEMA_FOR_SANITIZE = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'blockquote',
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    th: [...(defaultSchema.attributes?.th || []), 'align', 'rowspan', 'colspan'],
    td: [...(defaultSchema.attributes?.td || []), 'align', 'rowspan', 'colspan'],
    table: [...(defaultSchema.attributes?.table || []), 'border', 'cellpadding', 'cellspacing'],
    blockquote: [...(defaultSchema.attributes?.blockquote || []), 'className'],
    div: [...(defaultSchema.attributes?.div || []), 'className'],
    p: [...(defaultSchema.attributes?.p || []), 'className'],
  },
};

/**
 * The color theme of the rendered Markdown.
 */
export enum COLOR_THEME {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  DYNAMIC = 'DYNAMIC',
}

/**
 * A service class for parsing Markdown content into sanitized HTML.
 * It uses the remark-rehype plugin chain to convert Markdown to HTML,
 * and then applies the GitHub Markdown CSS to ensure consistent styling.
 *
 * Inline styles are applied using the juice library to ensure consistent rendering across browsers and email clients.
 */
@Injectable()
export class MarkdownParser {
  public async parseToHtml(markdown: string, theme = COLOR_THEME.DYNAMIC): Promise<string> {
    const html = await this.runPipeline(markdown);

    const content = `<div class="markdown-body">${html}</div>`;

    return juice.inlineContent(content, this.getColorThemeCss(theme), {
      preserveMediaQueries: true,
      applyAttributesTableElements: true,
      applyWidthAttributes: true,
      applyHeightAttributes: true,
      resolveCSSVariables: true,
    });
  }

  /**
   * Parse Markdown into a sanitized HTML fragment WITHOUT the GitHub Markdown CSS
   * or `juice` inlining. Use this when the rendered HTML is injected into an app
   * page that already provides its own styling (e.g. an in-app chat bubble): the
   * heavy inline styles and the preserved `<style>` media-query block that
   * `parseToHtml` emits would otherwise leak into the host page or fight its
   * design system. The output is the same XSS-safe, GFM-capable HTML, just bare.
   */
  public async parseToFragment(markdown: string): Promise<string> {
    return this.runPipeline(markdown);
  }

  /**
   * The shared remark → rehype → sanitize → stringify chain. Both `parseToHtml`
   * and `parseToFragment` go through this so the sanitization (and thus the
   * security posture) is identical regardless of how the result is styled.
   */
  private async runPipeline(markdown: string): Promise<string> {
    const html = await remark()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkAlert, { tagName: 'blockquote' })
      .use(remarkRehype)
      .use(rehypeSanitize, EXTENDED_SCHEMA_FOR_SANITIZE) // filter out potentially dangerous HTML
      .use(rehypeNormalizeTableTruncationNoticeRows)
      .use(rehypeStringify)
      .process(markdown);

    return String(html);
  }

  private getColorThemeCss(theme: COLOR_THEME): string {
    let cssVariables: string;
    switch (theme) {
      case COLOR_THEME.LIGHT:
        cssVariables = GITHUB_LIGHT_THEME_VARIABLES_CSS;
        break;
      case COLOR_THEME.DARK:
        cssVariables = GITHUB_DARK_THEME_VARIABLES_CSS;
        break;
      case COLOR_THEME.DYNAMIC:
        cssVariables = GITHUB_DYNAMIC_THEME_VARIABLES_CSS;
        break;
      default:
        throw new Error(`Unsupported color theme: ${theme}`);
    }
    return `
      ${cssVariables}
      ${GITHUB_MARKDOWN_CSS}
    `;
  }
}
