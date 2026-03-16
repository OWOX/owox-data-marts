import { createIdentifierEscaper, IdentifierEscaperConfig } from './identifier-escaper.utils';

/**
 * Shared test suite for identifier escapers created by createIdentifierEscaper.
 */
export function describeIdentifierEscaper(
  storageName: string,
  config: IdentifierEscaperConfig,
  escaper: (identifier: string) => string,
  extraTests?: () => void
): void {
  const q = config.quoteChar;

  describe(`escape${storageName}Identifier`, () => {
    it('should escape a single identifier', () => {
      expect(escaper('my_table')).toBe(`${q}my_table${q}`);
    });

    it('should escape a 2-level identifier', () => {
      expect(escaper('schema.table')).toBe(`${q}schema${q}.${q}table${q}`);
    });

    it('should escape a 3-level identifier', () => {
      expect(escaper('db.schema.table')).toBe(`${q}db${q}.${q}schema${q}.${q}table${q}`);
    });

    it('should re-escape already quoted identifiers', () => {
      expect(escaper(`${q}schema${q}.${q}table${q}`)).toBe(`${q}schema${q}.${q}table${q}`);
    });

    it(`should escape inner ${q === '`' ? 'backticks' : 'double quotes'} by doubling`, () => {
      // Inner quote chars within a properly quoted identifier get doubled
      expect(escaper(`${q}table${q}${q}name${q}`)).toBe(`${q}table${q}${q}name${q}`);
    });

    it('should return empty/falsy input as-is', () => {
      expect(escaper('')).toBe('');
    });

    if (extraTests) {
      extraTests();
    }
  });
}

// Self-tests for createIdentifierEscaper
describe('createIdentifierEscaper', () => {
  describe('with double-quote char', () => {
    const escaper = createIdentifierEscaper({ quoteChar: '"' });

    it('should wrap parts in double quotes', () => {
      expect(escaper('schema.table')).toBe('"schema"."table"');
    });

    it('should escape inner double quotes by doubling', () => {
      expect(escaper('table"with"quotes')).toBe('"table""with""quotes"');
    });

    it('should handle already-quoted parts', () => {
      expect(escaper('"schema"."table"')).toBe('"schema"."table"');
    });
  });

  describe('with backtick char', () => {
    const escaper = createIdentifierEscaper({ quoteChar: '`' });

    it('should wrap parts in backticks', () => {
      expect(escaper('schema.table')).toBe('`schema`.`table`');
    });

    it('should wrap unquoted parts in backticks', () => {
      expect(escaper('catalog.schema.table')).toBe('`catalog`.`schema`.`table`');
    });

    it('should handle already-quoted parts', () => {
      expect(escaper('`schema`.`table`')).toBe('`schema`.`table`');
    });
  });
});
