import { createIdentifierValidator, IdentifierValidatorConfig } from './validation.utils';

/**
 * Shared test suite for fully qualified name validators (allowWildcard: false).
 */
export function describeFullyQualifiedNameValidator(
  storageName: string,
  config: Omit<IdentifierValidatorConfig, 'allowWildcard'>,
  validator: (value: string) => boolean,
  extraTests?: () => void
): void {
  describe(`isValid${storageName}FullyQualifiedName`, () => {
    it('should return true for valid 3-level names', () => {
      expect(validator('part1.part2.part3')).toBe(true);
      expect(validator('my_a.my_b.my_c')).toBe(true);
      expect(validator('a1.b1.c1')).toBe(true);
    });

    if (config.allowTwoLevel) {
      it('should return true for valid 2-level names', () => {
        expect(validator('part1.part2')).toBe(true);
        expect(validator('my_a.my_b')).toBe(true);
      });
    } else {
      it('should return false for 2-level names', () => {
        expect(validator('part1.part2')).toBe(false);
      });
    }

    if (config.allowQuotedSegments) {
      it('should return true for quoted segments', () => {
        expect(validator('a."b"."c"')).toBe(true);
        expect(validator('"a"."b"."c"')).toBe(true);
      });

      it('should return false for invalid content inside quotes', () => {
        expect(validator('a."b;DROP"."c"')).toBe(false);
        expect(validator('a."b "."c"')).toBe(false);
        expect(validator('a."b\'"."c"')).toBe(false);
      });

      it('should return false for SQL injection with quoted segments', () => {
        expect(validator('a.b."c" UNION SELECT')).toBe(false);
      });
    } else {
      it('should return false for SQL injection attempts with double quotes', () => {
        expect(validator('a."b"."c"')).toBe(false);
        expect(validator('a.b."c" UNION SELECT')).toBe(false);
        expect(validator('"a"."b"."c"')).toBe(false);
      });
    }

    it('should return false for SQL injection attempts with semicolon', () => {
      expect(validator('a.b.c; DROP')).toBe(false);
      expect(validator('a.b.c;DELETE')).toBe(false);
    });

    it('should return false for names with backticks', () => {
      expect(validator('`a`.`b`.`c`')).toBe(false);
      expect(validator('a.b.`c`')).toBe(false);
      expect(validator('a.b.c`')).toBe(false);
    });

    it('should return false for names with special characters', () => {
      expect(validator('a.b.c*')).toBe(false);
      expect(validator("a.b.c'")).toBe(false);
      expect(validator('a.b.c/')).toBe(false);
      expect(validator('a.b.c\\')).toBe(false);
    });

    it('should return false for empty or invalid input', () => {
      expect(validator('')).toBe(false);
      expect(validator('single')).toBe(false);
      expect(validator('a.b.c.d')).toBe(false);
    });

    if (extraTests) {
      extraTests();
    }
  });
}

/**
 * Shared test suite for table pattern validators (allowWildcard: true).
 */
export function describeTablePatternValidator(
  storageName: string,
  config: Omit<IdentifierValidatorConfig, 'allowWildcard'>,
  validator: (value: string) => boolean,
  extraTests?: () => void
): void {
  describe(`isValid${storageName}TablePattern`, () => {
    it('should return true for valid 3-level patterns', () => {
      expect(validator('a.b.c_*')).toBe(true);
      expect(validator('my_a.my_b.my_c_*')).toBe(true);
      expect(validator('a.b.*')).toBe(true);
    });

    if (config.allowTwoLevel) {
      it('should return true for valid 2-level patterns', () => {
        expect(validator('a.b_*')).toBe(true);
        expect(validator('my_a.my_b_*')).toBe(true);
        expect(validator('a.*')).toBe(true);
      });
    } else {
      it('should return false for 2-level patterns', () => {
        expect(validator('a.b_*')).toBe(false);
        expect(validator('a.*')).toBe(false);
      });
    }

    it('should return false for SQL injection attempts', () => {
      expect(validator('a.b."c"*')).toBe(false);
      expect(validator('a.b.c*; DROP')).toBe(false);
    });

    it('should return false for empty or invalid input', () => {
      expect(validator('')).toBe(false);
      expect(validator('single')).toBe(false);
    });

    if (extraTests) {
      extraTests();
    }
  });
}

// Self-tests for createIdentifierValidator
describe('createIdentifierValidator', () => {
  it('should create a 3-level-only validator without wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: false,
    });
    expect(validator('a.b.c')).toBe(true);
    expect(validator('a.b')).toBe(false);
    expect(validator('')).toBe(false);
    expect(validator('a.b.c*')).toBe(false);
  });

  it('should create a 2-or-3-level validator without wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
      allowWildcard: false,
    });
    expect(validator('a.b.c')).toBe(true);
    expect(validator('a.b')).toBe(true);
    expect(validator('a')).toBe(false);
  });

  it('should create a 3-level-only validator with wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: true,
    });
    expect(validator('a.b.c_*')).toBe(true);
    expect(validator('a.b.*')).toBe(true);
    expect(validator('a.b_*')).toBe(false);
  });

  it('should create a 2-or-3-level validator with wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
      allowWildcard: true,
    });
    expect(validator('a.b.c_*')).toBe(true);
    expect(validator('a.b_*')).toBe(true);
    expect(validator('a.*')).toBe(true);
  });

  it('should accept quoted segments when allowQuotedSegments is true', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: false,
      allowQuotedSegments: true,
    });
    expect(validator('a."b"."c"')).toBe(true);
    expect(validator('"a"."b"."c"')).toBe(true);
    expect(validator('a.b.c')).toBe(true);
    expect(validator('a."b;DROP"."c"')).toBe(false);
    expect(validator('a."b "."c"')).toBe(false);
  });

  it('should reject quoted segments when allowQuotedSegments is false', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: false,
    });
    expect(validator('a."b"."c"')).toBe(false);
    expect(validator('"a"."b"."c"')).toBe(false);
  });
});
