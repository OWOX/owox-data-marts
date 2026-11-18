import { CONTROL_CHARACTER } from './pluginRoute';

const MAX_RAW_UNSAVED_MESSAGE_LENGTH = 1000;
const MAX_UNSAVED_MESSAGE_LENGTH = 200;
/** Characters that paint nothing but are not whitespace, so a message of only these looks empty. */
const BLANK_FILLERS = String.fromCharCode(0x00ad, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800);
/** Every format character except the joiners that Persian words and emoji sequences need. */
const FORMAT_CHARACTER_EXCEPT_JOINERS = /(?![\u200c\u200d])\p{Cf}/u;
const INVISIBLE_CHARACTERS = new RegExp(
  `${CONTROL_CHARACTER.source}|${FORMAT_CHARACTER_EXCEPT_JOINERS.source}|[${BLANK_FILLERS}]`,
  'gu'
);
const VISIBLE_CHARACTER = /[^\s\u200c\u200d]/u;
/** More marks on one letter stack up and paint over the dialog title and buttons. */
const STACKED_COMBINING_MARKS = /(\p{M}{4})\p{M}+/gu;

export function normalizeUnsavedMessage(message: string | undefined): string | undefined {
  if (message === undefined) return undefined;
  const text = cut(message, MAX_RAW_UNSAVED_MESSAGE_LENGTH)
    .replace(/\s+/g, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(STACKED_COMBINING_MARKS, '$1')
    .trim();
  if (!VISIBLE_CHARACTER.test(text)) return undefined;
  return text.length > MAX_UNSAVED_MESSAGE_LENGTH
    ? `${cut(text, MAX_UNSAVED_MESSAGE_LENGTH)}…`
    : text;
}

/** Cuts to `length` code units, one fewer when the cut would split a surrogate pair. */
function cut(text: string, length: number): string {
  const last = text.charCodeAt(length - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? length - 1 : length);
}
