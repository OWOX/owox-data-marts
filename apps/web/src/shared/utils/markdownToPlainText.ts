// Both callers show one truncated line; the cap also keeps the regexes fast.
const MAX_INPUT_LENGTH = 2000;
// Escaped characters and code move to the private-use area so later steps do not read them as syntax.
const ESCAPE_BASE = 0xe000;
const PUNCTUATION = /[!-/:-@[-`{-~]/g;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
const RESTORE = new RegExp(
  `[${String.fromCharCode(ESCAPE_BASE + 0x21)}-${String.fromCharCode(ESCAPE_BASE + 0x7e)}]`,
  'g'
);
// Marks the end of a heading, so that "## Mission" + text reads "Mission: text".
const HEADING_END = String.fromCharCode(ESCAPE_BASE);
const LAST_HEADING_END = new RegExp(` ?${HEADING_END}$`);
const HEADING_ENDS = new RegExp(`(\\S?) ?${HEADING_END}`, 'g');
// FENCE and RULE test a trimmed line: blank runs at both ends made RULE backtrack in cubic time.
const FENCE = /^(?:```|~~~)/;
const RULE =
  /^(?:([-*_])(?:[ \t]*\1){2,}|=+|\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?)$/;
const PREFIX =
  /^\s*(?:>[ \t]*(?:\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])?|[-*+]\s|\d+\.\s|\[[ xX]\]\s|(#{1,6})(?:\s|$))/;
const CODE = /`([^`]+)`/g;
// No lookbehind: Safari before 16.4 throws on it when the module loads.
const WORD = /[\p{L}\p{N}]/u;
// A * or _ next to another one is part of a name, such as stg_hubspot__deals, not emphasis.
const EMPHASIS = /(^|(?![*_])[\s\p{P}])([*_])(\S|\S.*?\S)\2(?![*_])(?=$|[\s\p{P}])/gu;

function hide(char: string): string {
  return String.fromCharCode(ESCAPE_BASE + char.charCodeAt(0));
}

function removeBlockSyntax(line: string): string {
  let text = line;
  let heading = false;
  for (;;) {
    const trimmed = text.trim();
    if (FENCE.test(trimmed) || RULE.test(trimmed)) return '';
    const match: RegExpExecArray | null = heading ? null : PREFIX.exec(text);
    if (!match) break;
    heading = Boolean(match[1]);
    text = text.slice(match[0].length);
  }
  text = text.trim();
  if (heading) text = text.replace(/(?:^|\s)#+$/, '');
  if (text.startsWith('|')) text = text.replace(/\|/g, ' ');
  text = text.replace(CODE, (_, code: string) => code.replace(PUNCTUATION, hide));
  return heading && text ? `${text} ${HEADING_END}` : text;
}

export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      .slice(0, MAX_INPUT_LENGTH)
      .replace(/\r\n?/g, '\n')
      .replace(/\\$/gm, '')
      .replace(ESCAPE, (_, char: string) => hide(char))
      .split('\n')
      .map(removeBlockSyntax)
      .join(' ')
      // Inline syntax is removed from the joined text, because a link or emphasis can span lines.
      .replace(/!\[([^[\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^[\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|~~/g, '')
      .replace(/__/g, (match, i: number, text: string) =>
        WORD.test(text[i - 1] ?? '') && WORD.test(text[i + 2] ?? '') ? match : ''
      )
      .replace(EMPHASIS, '$1$3')
      .replace(/`/g, '')
      .replace(RESTORE, char => String.fromCharCode(char.charCodeAt(0) - ESCAPE_BASE))
      .replace(/\s+/g, ' ')
      .replace(LAST_HEADING_END, '')
      .replace(HEADING_ENDS, (_, end: string) => (!end || /[.:!?]/.test(end) ? end : `${end}:`))
      .trim()
  );
}
