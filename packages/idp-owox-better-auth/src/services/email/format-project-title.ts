/**
 * Anyone can name a project and invite any address, so a title is untrusted text
 * that must not become a link or a message in an email.
 */

/** Longer titles are cut, so a title cannot carry a whole message into a subject line. */
export const MAX_EMAIL_PROJECT_TITLE_LENGTH = 100;

/**
 * Full stops left after NFKC normalization. NFKC already turns the fullwidth (U+FF0E),
 * one dot leader (U+2024) and small (U+FE52) full stops into ".", and the halfwidth and
 * vertical ideographic ones into U+3002, which domain names also accept as a dot.
 */
const FULL_STOPS = /[.\u3002]/g;

/**
 * Invisible characters that can hide text, reverse it on screen or make a title look empty:
 * soft hyphen, combining grapheme joiner, Arabic letter mark, Hangul fillers, Mongolian vowel
 * separator, zero-width and bidi controls, word joiners, Braille blank, BOM and tag characters.
 * The combining grapheme joiner stays outside the class: it attaches to the character before it.
 */
const INVISIBLE_CHARACTERS =
  /\u034F|[\u00AD\u061C\u115F\u1160\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0\u{E0000}-\u{E007F}]/gu;

const CONTROL_CHARACTERS = /\p{Cc}/gu;

const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Makes a project title safe to show in an email:
 * - fullwidth and other lookalike characters become plain ones (NFKC);
 * - invisible and control characters go, so the text reads as it is stored;
 * - full stops become spaces, so mail clients do not turn "acme.com" into a link;
 * - "://" gets a space, so a URL without dots ("http://3232235777") is not a link either;
 * - titles longer than {@link MAX_EMAIL_PROJECT_TITLE_LENGTH} visible characters are cut.
 *
 * May return an empty string; callers then leave the title out.
 */
export function formatProjectTitle(title: string): string {
  const text = title
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(FULL_STOPS, ' ')
    .replace(/:\/\//g, ': //')
    .replace(/\s+/g, ' ')
    .trim();

  // Count what the reader sees, so a cut never splits an emoji or a letter from its accent.
  const characters = Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
  if (characters.length <= MAX_EMAIL_PROJECT_TITLE_LENGTH) {
    return text;
  }
  return `${characters
    .slice(0, MAX_EMAIL_PROJECT_TITLE_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}
