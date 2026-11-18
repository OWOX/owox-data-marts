// Both callers show one truncated line; the cap also bounds regex backtracking.
const MAX_INPUT_LENGTH = 2000;
// Escaped characters move to the private-use area so later steps do not read them as syntax.
const ESCAPE_BASE = 0xe000;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
const RESTORE = new RegExp(
  `[${String.fromCharCode(ESCAPE_BASE)}-${String.fromCharCode(ESCAPE_BASE + 0x7e)}]`,
  'g'
);
const FENCE = /^[ \t]*(?:```|~~~)/;
const RULE =
  /^[ \t]*(?:([-*_])(?:[ \t]*\1){2,}|\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?)[ \t]*$/;
const PREFIX =
  /^\s*(?:>[ \t]*(?:\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])?|[-*+]\s|\d+\.\s|\[[ xX]\]\s|(#{1,6})(?:\s|$))/;
// __ between letters or digits is part of a name, such as stg_hubspot__deals.
const DOUBLE_UNDERSCORE = /(?<![\p{L}\p{N}])__|__(?![\p{L}\p{N}])/gu;
// A * or _ next to another one is part of such a name too, not emphasis.
const EMPHASIS = /(^|[\s\p{P}])(?<![*_])([*_])(?=\S)(.+?)(?<=\S)\2(?![*_])(?=$|[\s\p{P}])/gu;

function lineToText(line: string): string {
  let text = line;
  let heading = false;
  for (;;) {
    if (FENCE.test(text) || RULE.test(text)) return '';
    const match: RegExpExecArray | null = heading ? null : PREFIX.exec(text);
    if (!match) break;
    heading = Boolean(match[1]);
    text = text.slice(match[0].length);
  }
  text = text.trim();
  if (heading) text = text.replace(/(?:^|\s)#+$/, '');
  if (text.startsWith('|')) text = text.replace(/\|/g, ' ');
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|~~/g, '')
    .replace(DOUBLE_UNDERSCORE, '')
    .replace(EMPHASIS, '$1$3')
    .replace(/`/g, '')
    .replace(RESTORE, char => String.fromCharCode(char.charCodeAt(0) - ESCAPE_BASE))
    .trim();
  return heading && text && !/[.:!?]$/.test(text) ? `${text}:` : text;
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/\r\n?/g, '\n')
    .replace(/\\$/gm, '')
    .replace(ESCAPE, (_, char: string) => String.fromCharCode(ESCAPE_BASE + char.charCodeAt(0)))
    .split('\n')
    .map(lineToText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '');
}
