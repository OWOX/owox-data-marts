import { describe, expect, it } from 'vitest';
import {
  joinedCountWarning,
  type JoinedCountWarning,
  type JoinedCountWarningOptions,
  type JoinedCountWarningPart,
} from './joined-count-warning';

const TITLES: Record<string, string> = { orders: 'Orders', 'orders.items': 'Items' };
const OPTIONS: JoinedCountWarningOptions = {
  name: 'Orders',
  mainName: 'Sessions',
  fieldLabel: 'order_id',
  nameAt: path => TITLES[path],
  offersCountUnique: true,
};
const warn = (source: Parameters<typeof joinedCountWarning>[0], options = OPTIONS) =>
  joinedCountWarning(source, options);

/** Names wrapped as the popover tells them apart: [Data Mart], {aggregation}, `field`. */
const marked = (parts: JoinedCountWarningPart[]) =>
  parts
    .map(part => {
      if (typeof part === 'string') return part;
      if (part.kind === 'dataMart') return `[${part.text}]`;
      if (part.kind === 'aggregation') return `{${part.text}}`;
      return `\`${part.text}\``;
    })
    .join('');
const reason = (warning: JoinedCountWarning | undefined) => marked(warning?.reason ?? []);
const advice = (warning: JoinedCountWarning | undefined) => marked(warning?.advice ?? []);

const COUNT_UNIQUE = 'Use {Count Unique} for distinct `order_id` values.';

describe('joinedCountWarning', () => {
  it('is undefined without a source', () => {
    expect(warn(undefined)).toBeUndefined();
  });

  it('is undefined when both verdicts are none', () => {
    expect(warn({ mainGrainMultiplication: 'none', mainGrainCollapse: 'none' })).toBeUndefined();
  });

  it('titles every verdict with what the number is not', () => {
    expect(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' })?.title).toBe(
      'May not match the number of Orders rows'
    );
    expect(warn({})?.title).toBe('May not match the number of Orders rows');
  });

  it('explains a multiplying join', () => {
    const warning = warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' });
    expect(reason(warning)).toBe(
      'One [Orders] row can match several [Sessions] rows and is counted for each, so the result can be higher.'
    );
    expect(advice(warning)).toBe(COUNT_UNIQUE);
  });

  it('explains a collapsing join', () => {
    expect(reason(warn({ mainGrainMultiplication: 'none', mainGrainCollapse: 'collapses' }))).toBe(
      'Several [Orders] rows can match one [Sessions] row and are counted once, so the result can be lower.'
    );
  });

  it('names the Data Mart a transitive collapse happens at', () => {
    const items = { ...OPTIONS, name: 'Items' };
    expect(
      reason(
        warn(
          {
            aliasPath: 'orders.items',
            mainGrainMultiplication: 'none',
            mainGrainCollapse: 'collapses',
            mainGrainCollapsedAt: 'orders',
          },
          items
        )
      )
    ).toBe(
      'Several [Orders] rows can match one [Sessions] row and are counted once, so the result can be lower.'
    );
  });

  it('explains multiplication together with collapse', () => {
    expect(
      reason(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'collapses' }))
    ).toBe(
      'One [Orders] row can match several [Sessions] rows, and several [Orders] rows can match one, so the result can be higher or lower.'
    );
  });

  it('names the Data Mart that has no primary key', () => {
    expect(
      reason(
        warn({
          mainGrainMultiplication: 'unknown',
          mainGrainCollapse: 'none',
          mainGrainUnprovenAt: '',
        })
      )
    ).toBe(
      "[Sessions] has no primary key, so it's unclear how many [Sessions] rows each [Orders] row matches. The result can be higher."
    );
    expect(
      reason(
        warn({
          mainGrainMultiplication: 'unknown',
          mainGrainCollapse: 'none',
          mainGrainUnprovenAt: 'orders',
        })
      )
    ).toMatch(/^\[Orders\] has no primary key, so/);
  });

  it('adds "or lower" to an unknown multiplication that also collapses', () => {
    expect(
      reason(warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' }))
    ).toBe(
      "Without a primary key, it's unclear how many [Sessions] rows each [Orders] row matches. The result can be higher or lower."
    );
  });

  it('reads absent verdicts as unknown and collapses', () => {
    expect(warn({})).toEqual(
      warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' })
    );
  });

  it("falls back to a description when the report's Data Mart has no name", () => {
    expect(
      reason(
        warn(
          { mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' },
          { ...OPTIONS, mainName: ' ' }
        )
      )
    ).toContain("several [this report's Data Mart] rows");
  });

  it('points to the joined Unique Count only when it is available', () => {
    const base = { mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' } as const;
    expect(advice(warn({ ...base, uniqueCountAvailability: 'available' }))).toBe(
      'Use {Count Unique} for distinct `order_id` values, or add `Unique Count` from [Orders] to count its rows.'
    );
    expect(advice(warn({ ...base, uniqueCountAvailability: 'no-primary-key' }))).toBe(COUNT_UNIQUE);
  });

  it('suggests Count Unique only when the column offers it', () => {
    const base = { mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' } as const;
    const noCountUnique = { ...OPTIONS, offersCountUnique: false };
    expect(warn(base, noCountUnique)?.advice).toEqual([]);
    expect(advice(warn({ ...base, uniqueCountAvailability: 'available' }, noCountUnique))).toBe(
      'Add `Unique Count` from [Orders] to count its rows.'
    );
  });
});
