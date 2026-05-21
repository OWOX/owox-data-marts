import { describe, expect, it } from 'vitest';
import { containsNonBmpCharacters, LEGACY_TITLE_ERROR } from './title-validation';

describe('title-validation', () => {
  describe('containsNonBmpCharacters', () => {
    it('returns false for an empty string', () => {
      expect(containsNonBmpCharacters('')).toBe(false);
    });

    it('returns false for ASCII characters', () => {
      expect(containsNonBmpCharacters('Hello World')).toBe(false);
      expect(containsNonBmpCharacters('Test123!@#')).toBe(false);
    });

    it('returns false for BMP Unicode characters', () => {
      expect(containsNonBmpCharacters('Café')).toBe(false);
      expect(containsNonBmpCharacters('日本語')).toBe(false);
      expect(containsNonBmpCharacters('Привіт')).toBe(false);
      expect(containsNonBmpCharacters('中文字符')).toBe(false);
    });

    it('returns true for emoji (outside BMP)', () => {
      expect(containsNonBmpCharacters('Hello 👋')).toBe(true);
      expect(containsNonBmpCharacters('🚀')).toBe(true);
      expect(containsNonBmpCharacters('😀😁😂')).toBe(true);
    });

    it('returns true for characters above U+FFFF', () => {
      expect(containsNonBmpCharacters('𝕳𝖊𝖑𝖑𝖔')).toBe(true);
      expect(containsNonBmpCharacters('𠀋')).toBe(true);
      expect(containsNonBmpCharacters('𝄞')).toBe(true);
    });

    it('returns true for mixed BMP and non-BMP strings', () => {
      expect(containsNonBmpCharacters('Test 🎉 party')).toBe(true);
      expect(containsNonBmpCharacters('Hello 𝄞 world')).toBe(true);
    });

    it('returns false for strings with combining marks only (still BMP)', () => {
      expect(containsNonBmpCharacters('e\u0301')).toBe(false);
    });
  });

  describe('LEGACY_TITLE_ERROR', () => {
    it('contains a human-readable error message', () => {
      expect(LEGACY_TITLE_ERROR).toContain('emoji');
      expect(LEGACY_TITLE_ERROR).toContain('Legacy BigQuery');
    });
  });
});
