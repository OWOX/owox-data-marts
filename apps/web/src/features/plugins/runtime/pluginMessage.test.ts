import { describe, expect, it } from 'vitest';
import { normalizeUnsavedMessage } from './pluginMessage';

const char = (code: number) => String.fromCharCode(code);
const BIDI_OVERRIDE = char(0x202e);
const BELL = char(0x07);
const ZERO_WIDTH_SPACE = char(0x200b);
const COMBINING_ACUTE = char(0x0301);
const HINDI_WORD = String.fromCharCode(0x091c, 0x093c, 0x093f, 0x0902, 0x0926, 0x0917, 0x0940);
const BLANK_FILLERS = [0x00ad, 0x115f, 0x1160, 0x3164, 0xffa0, 0x2800].map(char).join('');

describe('normalizeUnsavedMessage', () => {
  it.each([
    ['  Saved soon  ', 'Saved soon'],
    ['a'.repeat(200), 'a'.repeat(200)],
    ['a'.repeat(201), `${'a'.repeat(200)}…`],
    [`a${BIDI_OVERRIDE}b${BELL}c${ZERO_WIDTH_SPACE}d`, 'abcd'],
    ['a'.repeat(50_000), `${'a'.repeat(200)}…`],
    ['   ', undefined],
    [BIDI_OVERRIDE, undefined],
    [ZERO_WIDTH_SPACE.repeat(1000) + 'text', undefined],
    [undefined, undefined],
    ['a\nb', 'a b'],
    ['Not saved. \t\r\n Leave?', 'Not saved. Leave?'],
    [`${'a'.repeat(199)}😀b`, `${'a'.repeat(199)}…`],
    [`${ZERO_WIDTH_SPACE.repeat(998)}a😀b`, 'a'],
    [`e${COMBINING_ACUTE.repeat(10)}`, `e${COMBINING_ACUTE.repeat(4)}`],
    [HINDI_WORD, HINDI_WORD],
    [BLANK_FILLERS, undefined],
  ])('turns %j into %j', (input, expected) => {
    expect(normalizeUnsavedMessage(input)).toBe(expected);
  });
});
