import path from 'node:path';

/** Repo files outside `docs/` are published here, so a single gitignored folder holds them. */
export const PUBLIC_REPO_DIR = '_repo';

const SKIPPED_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE_OR_TAG_RE = /(`+)[\s\S]*?\1|<!--[\s\S]*?-->|<(img|source)\b[^>]*>/gi;
// A <picture> match never crosses another <picture> tag, and comments are skipped like code, so
// prose that names the tag (e.g. a markdownlint comment) is never taken for one.
const PICTURE_OR_CODE_RE =
  /(`+)[\s\S]*?\1|<!--[\s\S]*?-->|<picture\b[^>]*>(?:(?!<\/?picture\b)[\s\S])*?<\/picture>/gi;
const DARK_MEDIA_RE = /\smedia\s*=\s*(["'])\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\1/i;
const ATTR_RE = /(?<=\s)(srcset|src)(\s*=\s*)(["'])(.*?)\3/gi;

/**
 * Maps a repo-relative path (posix) to its path under `public/`. `docs/**` keeps its path
 * (that folder is already wiped and gitignored); anything else goes under `_repo/`.
 * @param {string} repoRelativePath - Path relative to the monorepo root, with `/` separators
 * @returns {string} Path relative to `public/`
 */
export function publicPathFor(repoRelativePath) {
  return repoRelativePath.startsWith('docs/')
    ? repoRelativePath
    : `${PUBLIC_REPO_DIR}/${repoRelativePath}`;
}

/**
 * Turns a theme `<picture>` (one `<source media="(prefers-color-scheme: dark)">` plus one `<img>`)
 * into two `<img>` tags that Starlight's theme selector can switch: the original image gets
 * `dark:sl-hidden`, a copy pointing at the dark `srcset` gets `light:sl-hidden`. Any other
 * `<picture>` is returned unchanged.
 * @param {string} picture - The whole `<picture>...</picture>` markup
 * @param {string} indent - Indentation of the line the `<picture>` starts on
 * @returns {string} Two `<img>` tags on separate lines, or `picture` as is
 */
function themePictureToImgs(picture, indent) {
  const sources = picture.match(/<source\b[^>]*>/gi) ?? [];
  const imgs = picture.match(/<img\b[^>]*>/gi) ?? [];
  if (sources.length !== 1 || imgs.length !== 1 || !DARK_MEDIA_RE.test(sources[0])) return picture;
  const srcset = /\ssrcset\s*=\s*(["'])(.*?)\1/i.exec(sources[0]);
  const darkUrl = srcset?.[2]
    .trim()
    .split(/\s*,\s*/)[0]
    .split(/\s+/)[0];
  if (!darkUrl) return picture;

  /** @param {string} tag @param {string} cls */
  const withClass = (tag, cls) =>
    /\sclass\s*=\s*(["'])/i.test(tag)
      ? tag.replace(
          /(\sclass\s*=\s*)(["'])(.*?)\2/i,
          (_m, lead, quote, value) => `${lead}${quote}${value} ${cls}${quote}`
        )
      : tag.replace(/^<img/i, `<img class="${cls}"`);

  const original = imgs[0];
  // The dark copy drops the img's own srcset (it would override the new src); the original keeps it.
  const darkCopy = original
    .replace(/\s+srcset\s*=\s*(["']).*?\1/i, '')
    .replace(
      /(\ssrc\s*=\s*)(["'])(.*?)\2/i,
      (_m, lead, quote) => `${lead}${quote}${darkUrl}${quote}`
    );
  return `${withClass(original, 'dark:sl-hidden')}\n${indent}${withClass(darkCopy, 'light:sl-hidden')}`;
}

/**
 * Rewrites relative `<img src>` and `<img|source srcset>` references in markdown content to
 * root-relative URLs of files that the caller copies into `public/`. Fenced code blocks and
 * inline code spans are left untouched, as are URLs that are absolute, remote, or point at
 * a file that does not exist. A theme `<picture>` is first split into two `<img>` tags (see
 * `themePictureToImgs`) so the docs theme selector, not the OS setting, picks the image.
 * @param {string} content - Markdown content
 * @param {Object} options
 * @param {string} options.sourceDir - Absolute directory of the source markdown file
 * @param {string} options.monorepoRoot - Absolute monorepo root
 * @param {string} options.base - Site base path (`''`, `'/'` or e.g. `'/docs-base'`)
 * @param {(absPath: string) => boolean} options.fileExists - Existence check (injectable)
 * @returns {{ content: string, copies: Array<{ from: string, publicPath: string }> }}
 *   Updated content and the files to copy (`from` is absolute, `publicPath` is relative to `public/`)
 */
export function rewriteHtmlImageLinks(content, { sourceDir, monorepoRoot, base, fileExists }) {
  const baseUrl = base.replace(/\/+$/, '');
  /** @type {Map<string, string>} */
  const copies = new Map();

  /** @param {string} url */
  const rewriteUrl = url => {
    if (!url || SKIPPED_URL_RE.test(url)) return url;
    const [, filePart, suffix] = /^([^?#]*)(.*)$/.exec(url) ?? [];
    if (!filePart) return url;
    const abs = path.resolve(sourceDir, filePart);
    const rel = path.relative(monorepoRoot, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fileExists(abs)) return url;
    const publicPath = publicPathFor(rel.split(path.sep).join('/'));
    copies.set(publicPath, abs);
    return `${baseUrl}/${publicPath}${suffix}`;
  };

  /** @param {string} text */
  const rewriteText = text =>
    text
      .replace(PICTURE_OR_CODE_RE, (match, ticks, offset, whole) => {
        if (ticks || match.startsWith('<!--')) return match; // inline code span or comment
        const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
        const indent = /^[ \t]*/.exec(whole.slice(lineStart))[0];
        return themePictureToImgs(match, indent);
      })
      .replace(INLINE_CODE_OR_TAG_RE, (match, _ticks, tagName) => {
        if (!tagName) return match; // inline code span or comment
        const isImg = tagName.toLowerCase() === 'img';
        return match.replace(ATTR_RE, (attr, name, eq, quote, value) => {
          const lower = name.toLowerCase();
          if (lower === 'src') {
            return isImg ? `${name}${eq}${quote}${rewriteUrl(value)}${quote}` : attr;
          }
          const srcset = value.replace(
            /(^|,\s*)([^\s,]+)/g,
            (_m, lead, url) => `${lead}${rewriteUrl(url)}`
          );
          return `${name}${eq}${quote}${srcset}${quote}`;
        });
      });

  // Walk line by line so fenced blocks are skipped; everything else is rewritten in chunks.
  const lines = content.split('\n');
  let fence = null;
  let chunk = [];
  const out = [];
  const flush = () => {
    if (chunk.length) out.push(rewriteText(chunk.join('\n')));
    chunk = [];
  };
  for (const line of lines) {
    const m = FENCE_RE.exec(line);
    if (fence) {
      out.push(line);
      if (
        m &&
        m[1][0] === fence[0] &&
        m[1].length >= fence.length &&
        !line.slice(m[0].length).trim()
      )
        fence = null;
    } else if (m) {
      flush();
      fence = m[1];
      out.push(line);
    } else {
      chunk.push(line);
    }
  }
  flush();

  return {
    content: out.join('\n'),
    copies: [...copies].map(([publicPath, from]) => ({ from, publicPath })),
  };
}
