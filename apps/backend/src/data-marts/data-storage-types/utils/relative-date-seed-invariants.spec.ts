/**
 * Calendar-bucket invariants for the relative_date integration-test seed.
 *
 * The real-DB integration suites (bigquery/athena/snowflake/redshift/databricks
 * `.integration.ts`) seed a fixed set of rows whose dates are expressed relative
 * to the DB clock, then assert which rows each `relative_date` preset returns.
 * Because a preset compares against the *live* DB date, any seed row whose date
 * is a sliding day-offset can drift across a calendar boundary and silently
 * change which bucket it lands in — turning a green suite red on a specific day
 * of the year. (Concretely: a "-200 days" row enters `this_year` once the run
 * date passes day 201 of the year, which is exactly what broke the scheduled
 * BigQuery + Athena suites on 2026-07-20.)
 *
 * This spec pins the seed *design* — not the DB — by mirroring the preset
 * boundaries as pure date arithmetic and asserting each seed role lands in its
 * intended calendar bucket for EVERY day of several representative years. It is
 * the date-independent guard the integration suites themselves cannot be (they
 * only ever run on a single day).
 *
 * The `anchoring` block ties the mirrored semantics back to production, so this
 * spec fails loudly if `renderRelativeDate` ever moves the bucket boundaries and
 * the mirror below (and the integration seed) must be revisited.
 */
import { BigQueryClauseRenderer } from '../bigquery/services/bigquery-clause-renderer';

// --- UTC date arithmetic mirroring the SQL the renderer emits ----------------

const DAY_MS = 86_400_000;

/** DATE_ADD/DATE_SUB(..., INTERVAL n DAY) — exact day shift. */
const shiftDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

/** DATE_ADD/DATE_SUB(..., INTERVAL n MONTH) — month shift with end-of-month clamp. */
function shiftMonths(d: Date, n: number): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

/** DATE_TRUNC(..., YEAR) — first day of the row's calendar year. */
const truncYear = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

const iso = (d: Date): string => d.toISOString().slice(0, 10);

// --- preset predicates, mirroring renderRelativeDate -------------------------

const isToday = (row: Date, today: Date): boolean => row.getTime() === today.getTime();

const inLastNDays = (row: Date, today: Date, n: number): boolean =>
  row.getTime() >= shiftDays(today, -n).getTime() && row.getTime() <= today.getTime();

const inLastNMonths = (row: Date, today: Date, n: number): boolean =>
  row.getTime() >= shiftMonths(today, -n).getTime() && row.getTime() <= today.getTime();

const inThisYear = (row: Date, today: Date): boolean =>
  row.getTime() >= truncYear(today).getTime() &&
  row.getTime() < Date.UTC(today.getUTCFullYear() + 1, 0, 1);

// --- seed roles from the bigquery/athena matrix table ------------------------
// The date each role holds, as a function of the DB "today".

const seed = {
  today: (t: Date): Date => t, // rows 1 & 5
  recent5d: (t: Date): Date => shiftDays(t, -5), // row 4
  mid40d: (t: Date): Date => shiftDays(t, -40), // row 2
  oldLastYear400d: (t: Date): Date => shiftDays(t, -400), // row 3
  // row 6 — the "last year" bucket, anchored to the calendar year (mid last year)
  // so it never drifts into this_year or the sliding windows regardless of run date.
  // SQL: DATE_SUB(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 6 MONTH) → Jul 1 of last year.
  lastYearBucket: (t: Date): Date => shiftMonths(truncYear(t), -6),
  future13m: (t: Date): Date => shiftMonths(t, 13), // row 7
};

// --- every day of a spread of representative years ---------------------------

function eachDayUTC(years: number[]): Date[] {
  const out: Date[] = [];
  for (const y of years) {
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day++) out.push(new Date(Date.UTC(y, m, day)));
    }
  }
  return out;
}

// 2028 is a leap year; 2100 is a non-leap century year — both stress boundaries.
const YEARS = [2025, 2026, 2027, 2028, 2100];
const DAYS = eachDayUTC(YEARS);

describe('relative_date seed calendar-bucket invariants', () => {
  describe('anchoring: production preset boundaries the mirror depends on', () => {
    const bq = new BigQueryClauseRenderer();

    it('this_year spans the whole calendar year (start of year .. start of next year)', () => {
      const sql = bq.renderWhere([
        { column: 'd', operator: 'relative_date', value: { kind: 'this_year' } },
      ]).sql;
      expect(sql).toContain('DATE_TRUNC(CURRENT_DATE(), YEAR)');
      expect(sql).toContain('INTERVAL 1 YEAR');
    });

    it('last_n_days / last_n_months are bounded above by today', () => {
      const days = bq.renderWhere([
        { column: 'd', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ]).sql;
      const months = bq.renderWhere([
        { column: 'd', operator: 'relative_date', value: { kind: 'last_n_months', n: 3 } },
      ]).sql;
      expect(days).toContain('<= CURRENT_DATE()');
      expect(months).toContain('<= CURRENT_DATE()');
    });
  });

  describe('for every day of every representative year', () => {
    it('today rows land in today / this_year / last_n_days(7) / last_n_months(3)', () => {
      const bad = DAYS.filter(t => {
        const row = seed.today(t);
        return !(
          isToday(row, t) &&
          inThisYear(row, t) &&
          inLastNDays(row, t, 7) &&
          inLastNMonths(row, t, 3)
        );
      });
      expect(bad.map(iso)).toEqual([]);
    });

    it('recent row (-5d) is in last_n_days(7) but is never "today"', () => {
      const bad = DAYS.filter(t => {
        const row = seed.recent5d(t);
        return !inLastNDays(row, t, 7) || isToday(row, t);
      });
      expect(bad.map(iso)).toEqual([]);
    });

    it('mid row (-40d) is in last_n_months(3) but not in last_n_days(7)', () => {
      const bad = DAYS.filter(t => {
        const row = seed.mid40d(t);
        return !inLastNMonths(row, t, 3) || inLastNDays(row, t, 7);
      });
      expect(bad.map(iso)).toEqual([]);
    });

    it('old row (-400d) is never in this_year / last_n_days(7) / last_n_months(3)', () => {
      const bad = DAYS.filter(t => {
        const row = seed.oldLastYear400d(t);
        return inThisYear(row, t) || inLastNDays(row, t, 7) || inLastNMonths(row, t, 3);
      });
      expect(bad.map(iso)).toEqual([]);
    });

    it('future row (+13m) is never in this_year / last_n_days(7) / last_n_months(3)', () => {
      const bad = DAYS.filter(t => {
        const row = seed.future13m(t);
        return inThisYear(row, t) || inLastNDays(row, t, 7) || inLastNMonths(row, t, 3);
      });
      expect(bad.map(iso)).toEqual([]);
    });

    // The invariant the -200d bug violates: the "last year" bucket must stay out
    // of this_year (and the sliding windows) regardless of the run date.
    it('last-year bucket row is never in this_year / last_n_days(7) / last_n_months(3)', () => {
      const bad = DAYS.filter(t => {
        const row = seed.lastYearBucket(t);
        return inThisYear(row, t) || inLastNDays(row, t, 7) || inLastNMonths(row, t, 3);
      });
      expect(bad.map(iso)).toEqual([]);
    });
  });

  // Documents WHY the integration this_year assertion must be membership-based
  // (toContain / not.toContain) rather than an exact toEqual over recent rows:
  // recent rows legitimately fall out of this_year near the start of the year.
  it('recent (-5d) and mid (-40d) rows are NOT stably inside this_year', () => {
    const recentUnstable = DAYS.some(t => !inThisYear(seed.recent5d(t), t));
    const midUnstable = DAYS.some(t => !inThisYear(seed.mid40d(t), t));
    expect(recentUnstable).toBe(true);
    expect(midUnstable).toBe(true);
  });
});
