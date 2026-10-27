import { describe, expect, it } from 'vitest';
import {
  joinedCountWarning,
  type JoinedCountWarning,
  type JoinedCountWarningOptions,
  type JoinedCountWarningPart,
} from './joined-count-warning';

const TITLES: Record<string, string> = { orders: 'Orders', 'orders.items': 'Items' };
const IDS: Record<string, string> = { orders: 'dm-orders', 'orders.items': 'dm-items' };
const OPTIONS: JoinedCountWarningOptions = {
  name: 'Orders',
  mainName: 'Sessions',
  fieldLabel: 'order_id',
  nameAt: path => TITLES[path],
  mainDataMartId: 'dm-sessions',
  dataMartIdAt: path => IDS[path],
  offersCountUnique: true,
};
const warn = (source: Parameters<typeof joinedCountWarning>[0], options = OPTIONS) =>
  joinedCountWarning(source, options);

/**
 * Names wrapped as the popover tells them apart: [Data Mart], {aggregation}, `field`, and a link to
 * a Data Mart's Output Schema as <id|text>.
 */
const marked = (parts: JoinedCountWarningPart[]): string =>
  parts
    .map(part => {
      if (typeof part === 'string') return part;
      if (part.kind === 'outputSchemaLink') return `<${part.dataMartId}|${marked(part.parts)}>`;
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

  it('titles every verdict with what Count counts and what it does not', () => {
    expect(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' })?.title).toBe(
      'Counts Sessions rows, not Orders rows'
    );
    expect(warn({})?.title).toBe('Counts Sessions rows, not Orders rows');
  });

  it('explains a multiplying join', () => {
    const warning = warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'none' });
    expect(reason(warning)).toBe(
      'One [Orders] row can match several [Sessions] rows, so the count can be higher than the number of [Orders] rows.'
    );
    expect(advice(warning)).toBe(COUNT_UNIQUE);
  });

  it('explains a collapsing join', () => {
    expect(reason(warn({ mainGrainMultiplication: 'none', mainGrainCollapse: 'collapses' }))).toBe(
      'Several [Orders] rows can match one [Sessions] row, so the count can be lower than the number of [Orders] rows.'
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
      'Several [Orders] rows can match one [Sessions] row, so the count can be lower than the number of [Items] rows.'
    );
  });

  it('explains multiplication together with collapse', () => {
    expect(
      reason(warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'collapses' }))
    ).toBe(
      'One [Orders] row can match several [Sessions] rows, and several [Orders] rows can match one [Sessions] row, so the count can be higher or lower than the number of [Orders] rows.'
    );
  });

  it('names the Data Mart that has no primary key and how to settle it', () => {
    expect(
      reason(
        warn({
          mainGrainMultiplication: 'unknown',
          mainGrainCollapse: 'none',
          mainGrainUnprovenAt: '',
        })
      )
    ).toBe(
      "[Sessions] has no primary key, so it's unclear how many [Sessions] rows each [Orders] row matches. The count can be higher than the number of [Orders] rows. <dm-sessions|Set a primary key on [Sessions]> to get a definite answer."
    );
    const atOrders = reason(
      warn({
        mainGrainMultiplication: 'unknown',
        mainGrainCollapse: 'none',
        mainGrainUnprovenAt: 'orders',
      })
    );
    expect(atOrders).toMatch(/^\[Orders\] has no primary key, so/);
    expect(atOrders).toMatch(
      / <dm-orders\|Set a primary key on \[Orders\]> to get a definite answer\.$/
    );
  });

  it('keeps the primary-key advice as text when the Data Mart has no known id', () => {
    expect(
      reason(
        warn(
          {
            mainGrainMultiplication: 'unknown',
            mainGrainCollapse: 'none',
            mainGrainUnprovenAt: 'orders',
          },
          { ...OPTIONS, dataMartIdAt: () => undefined }
        )
      )
    ).toMatch(/ Set a primary key on \[Orders\] to get a definite answer\.$/);
  });

  it('adds "or lower" to an unknown multiplication that also collapses', () => {
    expect(
      reason(warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' }))
    ).toBe(
      "Without a primary key, it's unclear how many [Sessions] rows each [Orders] row matches. The count can be higher or lower than the number of [Orders] rows."
    );
  });

  it('reads absent verdicts as unknown and collapses', () => {
    expect(warn({})).toEqual(
      warn({ mainGrainMultiplication: 'unknown', mainGrainCollapse: 'collapses' })
    );
  });

  describe("when the report's Data Mart has no name", () => {
    const unnamed = { ...OPTIONS, mainName: ' ' };

    it('describes it in place of the name, in words that still read as a sentence', () => {
      expect(
        warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'collapses' }, unnamed)
      ).toMatchObject({ title: "Counts rows of this report's Data Mart, not Orders rows" });
      expect(
        reason(
          warn({ mainGrainMultiplication: 'multiplies', mainGrainCollapse: 'collapses' }, unnamed)
        )
      ).toBe(
        "One [Orders] row can match several rows of this report's Data Mart, and several [Orders] rows can match one row of this report's Data Mart, so the count can be higher or lower than the number of [Orders] rows."
      );
    });

    it('starts the no-primary-key sentence with a capital', () => {
      expect(
        reason(
          warn(
            {
              mainGrainMultiplication: 'unknown',
              mainGrainCollapse: 'none',
              mainGrainUnprovenAt: '',
            },
            unnamed
          )
        )
      ).toBe(
        "This report's Data Mart has no primary key, so it's unclear how many rows of this report's Data Mart each [Orders] row matches. The count can be higher than the number of [Orders] rows. <dm-sessions|Set a primary key on this report's Data Mart> to get a definite answer."
      );
    });
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
