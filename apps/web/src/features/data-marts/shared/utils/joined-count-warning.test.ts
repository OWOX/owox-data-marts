import { describe, expect, it } from 'vitest';
import { joinedCountWarning, type JoinedCountWarningOptions } from './joined-count-warning';

const LEAD =
  "Count counts the rows of this report's Data Mart that have a match in Orders, not the rows of Orders.";
const UNIQUE = ' Count Unique counts distinct values of this column instead.';
const TITLES: Record<string, string> = { orders: 'Orders', 'orders.items': 'Items' };
const OPTIONS: JoinedCountWarningOptions = {
  name: 'Orders',
  nameAt: path => TITLES[path],
  offersCountUnique: true,
};
const warn = (source: Parameters<typeof joinedCountWarning>[0], options = OPTIONS) =>
  joinedCountWarning(source, options);

describe('joinedCountWarning', () => {
  it('is undefined without a source', () => {
    expect(warn(undefined)).toBeUndefined();
  });

  it('is undefined when both verdicts are none', () => {
    expect(warn({ mainGrainMultiplication: 'none', mainGrainCollapse: 'none' })).toBeUndefined();
  });

  it('explains a multiplying join', () => {
    expect(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' })).toBe(
      `${LEAD} One Orders row can match several of them, so the count can be higher.${UNIQUE}`
    );
  });

  it('explains a collapsing join', () => {
    expect(warn({ mainGrainMultiplication: 'none', mainGrainCollapse: 'collapses' })).toBe(
      `${LEAD} Several Orders rows can share one join key value, so the count can be lower.${UNIQUE}`
    );
  });

  it('names the Data Mart a transitive collapse happens at', () => {
    const items = { ...OPTIONS, name: 'Items' };
    expect(
      warn(
        {
          aliasPath: 'orders.items',
          mainGrainMultiplication: 'none',
          mainGrainCollapse: 'collapses',
          mainGrainCollapsedAt: 'orders',
        },
        items
      )
    ).toContain(' Several Orders rows can share one join key value, so the count can be lower.');
  });

  it('explains multiplication together with collapse', () => {
    expect(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'collapses' })).toBe(
      `${LEAD} One Orders row can match several of them, and several Orders rows can share one join key value, so the count can be higher or lower.${UNIQUE}`
    );
  });

  it('names the Data Mart that has no primary key', () => {
    expect(
      warn({
        mainGrainMultiplication: 'unknown',
        mainGrainCollapse: 'none',
        mainGrainUnprovenAt: '',
      })
    ).toBe(
      `${LEAD} This report's Data Mart has no primary key, so it can't be checked whether one Orders row matches one row or several: the count can be higher.${UNIQUE}`
    );
    expect(
      warn({
        mainGrainMultiplication: 'unknown',
        mainGrainCollapse: 'none',
        mainGrainUnprovenAt: 'orders',
      })
    ).toContain(' Orders has no primary key, so');
  });

  it('adds "or lower" to an unknown multiplication that also collapses', () => {
    expect(warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' })).toBe(
      `${LEAD} Without a primary key it can't be checked whether one Orders row matches one row or several: the count can be higher or lower.${UNIQUE}`
    );
  });

  it('reads absent verdicts as unknown and collapses', () => {
    expect(warn({})).toBe(
      warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' })
    );
  });

  it('mentions the joined Unique Count only when it is available', () => {
    const base = { mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' } as const;
    expect(warn({ ...base, uniqueCountAvailability: 'available' })).toMatch(
      /instead, and the Unique Count of Orders counts its rows\.$/
    );
    expect(warn({ ...base, uniqueCountAvailability: 'no-primary-key' })).toMatch(/instead\.$/);
  });

  it('suggests Count Unique only when the column offers it', () => {
    const base = { mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' } as const;
    const noCountUnique = { ...OPTIONS, offersCountUnique: false };
    expect(warn(base, noCountUnique)).toBe(
      `${LEAD} One Orders row can match several of them, so the count can be higher.`
    );
    expect(warn({ ...base, uniqueCountAvailability: 'available' }, noCountUnique)).toMatch(
      /higher\. The Unique Count of Orders counts its rows\.$/
    );
  });
});
