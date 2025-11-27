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

const EXTENDED_SCHEMA_FOR_SANITIZE = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  attributes: {
    ...(defaultSchema.attributes || {}),
    th: [...(defaultSchema.attributes?.th || []), 'align', 'rowspan', 'colspan'],
    td: [...(defaultSchema.attributes?.td || []), 'align', 'rowspan', 'colspan'],
    table: [...(defaultSchema.attributes?.table || []), 'border', 'cellpadding', 'cellspacing'],
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
    const html = await remark()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize, EXTENDED_SCHEMA_FOR_SANITIZE) // filter out potentially dangerous HTML
      .use(rehypeStringify)
      .process(markdown);

    const content = `<div class="markdown-body">${String(html)}</div>`;

    return juice.inlineContent(content, this.getColorThemeCss(theme), {
      preserveMediaQueries: true,
      applyAttributesTableElements: true,
      applyWidthAttributes: true,
      applyHeightAttributes: true,
      resolveCSSVariables: true,
    });
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
