import path from 'node:path';

/** Repo files outside `docs/` are published here, so a single gitignored folder holds them. */
export const PUBLIC_REPO_DIR = '_repo';

const SKIPPED_URL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE_OR_TAG_RE = /(`+)[\s\S]*?\1|<(img|source)\b[^>]*>/gi;
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
 * Rewrites relative `<img src>` and `<img|source srcset>` references in markdown content to
 * root-relative URLs of files that the caller copies into `public/`. Fenced code blocks and
 * inline code spans are left untouched, as are URLs that are absolute, remote, or point at
 * a file that does not exist.
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
    text.replace(INLINE_CODE_OR_TAG_RE, (match, _ticks, tagName) => {
      if (!tagName) return match; // inline code span
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
