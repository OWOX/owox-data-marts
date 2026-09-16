/**
 * The one path out of `liftFormulaToGroupLevel` that is not a refusal.
 *
 * Every malformed formula is answered with `{ formula: null }`, which is why the function is
 * documented as total — but only a reference SYNTAX error is a malformed formula. Anything else
 * escaping the reference parser is a bug in this repo, and swallowing it would turn that bug into
 * a silently uncollapsed report. This pins the distinction, which no other test can reach without
 * a parser that misbehaves on purpose.
 */
import { FormulaReferenceSyntaxError } from './formula-reference';

jest.mock('./formula-reference', () => {
  const actual = jest.requireActual('./formula-reference');
  return { ...actual, parseFormulaReferences: jest.fn() };
});

import { parseFormulaReferences } from './formula-reference';
import { liftFormulaToGroupLevel } from './formula-lifting';

const lift = () =>
  liftFormulaToGroupLevel(
    '{{ref field="clicks"}}',
    () => ({ truncatesUnderDivision: false }),
    () => false
  );

describe('liftFormulaToGroupLevel — what it refuses to swallow', () => {
  it('answers a reference syntax error with a refusal, like any other malformed formula', () => {
    jest.mocked(parseFormulaReferences).mockImplementation(() => {
      throw new FormulaReferenceSyntaxError('unclosed tag');
    });

    expect(lift()).toEqual({ formula: null, reason: 'unparseable-formula' });
  });

  it('re-throws anything else, because that is this repo failing rather than the formula', () => {
    jest.mocked(parseFormulaReferences).mockImplementation(() => {
      throw new TypeError('reading of undefined');
    });

    expect(lift).toThrow(TypeError);
  });
});
