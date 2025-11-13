import { Injectable } from '@nestjs/common';
import juice from 'juice';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { GITHUB_MARKDOWN_CSS } from './github-markdown-css';

/**
 * A service class for parsing Markdown content into sanitized HTML.
 * It uses the remark-rehype plugin chain to convert Markdown to HTML,
 * and then applies the GitHub Markdown CSS to ensure consistent styling.
 *
 * Inline styles are applied using the juice library to ensure consistent rendering across browsers and email clients.
 */
@Injectable()
export class MarkdownParser {
  public async parseToHtml(markdown: string): Promise<string> {
    const html = await remark()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeSanitize) // filter out potentially dangerous HTML
      .use(rehypeStringify)
      .process(markdown);

    const content = `<div class="markdown-body">${String(html)}</div>`;

    return juice.inlineContent(content, GITHUB_MARKDOWN_CSS, {
      preserveMediaQueries: true,
      applyWidthAttributes: true,
      applyHeightAttributes: true,
    });
  }
}
