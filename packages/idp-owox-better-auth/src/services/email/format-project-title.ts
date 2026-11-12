/**
 * Anyone can name a project and invite any address, so a title is untrusted text
 * that must not become a link or a message in an email.
 */

/** Longer titles are cut, so a title cannot carry a whole message into an email. */
export const MAX_EMAIL_PROJECT_TITLE_LENGTH = 100;

/** A shorter cut for the subject line and the inbox preview, which a reader sees first. */
export const MAX_EMAIL_SUBJECT_PROJECT_TITLE_LENGTH = 60;

/**
 * Full stops left after NFKC normalization. NFKC already turns the fullwidth (U+FF0E),
 * one dot leader (U+2024) and small (U+FE52) full stops into ".", and the halfwidth and
 * vertical ideographic ones into U+3002, which domain names also accept as a dot.
 */
const FULL_STOPS = /[.\u3002]/g;

/**
 * Characters that render as nothing (Unicode Default_Ignorable_Code_Point): zero-width and bidi
 * controls, Hangul fillers, tag characters, variation selectors and the like. ZWNJ, ZWJ and the
 * text and emoji variation selectors stay, because emoji and some scripts need them; a title
 * made only of them has nothing visible and is dropped. An alternation, not a character class,
 * so ZWJ never sits inside a class.
 */
const INVISIBLE_CHARACTERS = /(?!\u200C|\u200D|\uFE0E|\uFE0F)\p{Default_Ignorable_Code_Point}/gu;

/** The Braille blank is not default-ignorable but shows nothing, like a space. */
const BLANK_CHARACTERS = /\u2800/g;

const CONTROL_CHARACTERS = /\p{Cc}/gu;

/** More than four combining marks on one character go, so a title cannot paint over nearby lines. */
const EXCESS_COMBINING_MARKS = /(\p{M}{4})\p{M}+/gu;

/** Something a reader can see: a letter, a digit, punctuation or a symbol (emoji included). */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Makes a project title safe to show in an email:
 * - fullwidth and other lookalike characters become plain ones (NFKC);
 * - invisible, blank and control characters go, so the text reads as it is stored;
 * - more than four combining marks on one character are dropped;
 * - full stops become spaces, so mail clients do not turn "acme.com" into a link;
 * - "://" gets a space, so a URL without dots ("http://3232235777") is not a link either;
 * - titles longer than `maxLength` visible characters are cut.
 *
 * Returns an empty string when nothing visible is left; callers then leave the title out.
 */
export function formatProjectTitle(
  title: string,
  maxLength: number = MAX_EMAIL_PROJECT_TITLE_LENGTH
): string {
  const text = title
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(BLANK_CHARACTERS, ' ')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(EXCESS_COMBINING_MARKS, '$1')
    .replace(FULL_STOPS, ' ')
    .replace(/:\/\//g, ': //')
    .replace(/\s+/g, ' ')
    .trim();
  if (!VISIBLE_CHARACTER.test(text)) {
    return '';
  }

  // Count what the reader sees, so a cut never splits an emoji or a letter from its accent.
  const characters = Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
  if (characters.length <= maxLength) {
    return text;
  }
  return `${characters
    .slice(0, maxLength - 1)
    .join('')
    .trimEnd()}…`;
}
