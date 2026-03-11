import {
<<<<<<< Updated upstream
  createFullyQualifiedNameValidator,
  createTablePatternValidator,
  StorageValidationConfig,
} from './validation.utils';

/**
 * Shared test suite for fully qualified name validators.
 * Each storage type calls this with its own config and extra test cases.
 */
export function describeFullyQualifiedNameValidator(
  storageName: string,
  config: StorageValidationConfig,
  validator: (value: string) => boolean,
  extraTests?: () => void
=======
  createIdentifierValidator,
  IdentifierValidatorConfig,
} from './validation.utils';

/**
 * Shared test suite for fully qualified name validators (allowWildcard: false).
 */
export function describeFullyQualifiedNameValidator(
  storageName: string,
  config: Omit<IdentifierValidatorConfig, 'allowWildcard'>,
  validator: (value: string) => boolean,
  extraTests?: () => void,
>>>>>>> Stashed changes
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

    it('should return false for SQL injection attempts with double quotes', () => {
      expect(validator('a."b"."c"')).toBe(false);
      expect(validator('a.b."c" UNION SELECT')).toBe(false);
      expect(validator('"a"."b"."c"')).toBe(false);
    });

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
<<<<<<< Updated upstream
 * Shared test suite for table pattern validators.
 */
export function describeTablePatternValidator(
  storageName: string,
  config: StorageValidationConfig,
  validator: (value: string) => boolean,
  extraTests?: () => void
=======
 * Shared test suite for table pattern validators (allowWildcard: true).
 */
export function describeTablePatternValidator(
  storageName: string,
  config: Omit<IdentifierValidatorConfig, 'allowWildcard'>,
  validator: (value: string) => boolean,
  extraTests?: () => void,
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
// Self-tests for the factory functions themselves
describe('createFullyQualifiedNameValidator', () => {
  it('should create a working 3-level-only validator', () => {
    const validator = createFullyQualifiedNameValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
=======
// Self-tests for createIdentifierValidator
describe('createIdentifierValidator', () => {
  it('should create a 3-level-only validator without wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: false,
>>>>>>> Stashed changes
    });
    expect(validator('a.b.c')).toBe(true);
    expect(validator('a.b')).toBe(false);
    expect(validator('')).toBe(false);
<<<<<<< Updated upstream
  });

  it('should create a working 2-or-3-level validator', () => {
    const validator = createFullyQualifiedNameValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
=======
    expect(validator('a.b.c*')).toBe(false);
  });

  it('should create a 2-or-3-level validator without wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
      allowWildcard: false,
>>>>>>> Stashed changes
    });
    expect(validator('a.b.c')).toBe(true);
    expect(validator('a.b')).toBe(true);
    expect(validator('a')).toBe(false);
  });
<<<<<<< Updated upstream
});

describe('createTablePatternValidator', () => {
  it('should create a working 3-level-only validator with wildcards', () => {
    const validator = createTablePatternValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
=======

  it('should create a 3-level-only validator with wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: false,
      allowWildcard: true,
>>>>>>> Stashed changes
    });
    expect(validator('a.b.c_*')).toBe(true);
    expect(validator('a.b.*')).toBe(true);
    expect(validator('a.b_*')).toBe(false);
  });

<<<<<<< Updated upstream
  it('should create a working 2-or-3-level validator with wildcards', () => {
    const validator = createTablePatternValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
=======
  it('should create a 2-or-3-level validator with wildcards', () => {
    const validator = createIdentifierValidator({
      allowedChars: 'a-zA-Z0-9_',
      allowTwoLevel: true,
      allowWildcard: true,
>>>>>>> Stashed changes
    });
    expect(validator('a.b.c_*')).toBe(true);
    expect(validator('a.b_*')).toBe(true);
    expect(validator('a.*')).toBe(true);
  });
});
