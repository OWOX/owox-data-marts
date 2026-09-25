/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Reformats an internal YYYY-MM-DD cursor date (the orchestrator's date
 * contract) into the format a target API expects, at the declarative injection
 * edge. The orchestrator's internal date representation is never changed.
 *
 * - falsy date, or absent / "YYYY-MM-DD" format -> returned unchanged (identity)
 * - "X" -> unix epoch seconds, "x" -> unix epoch milliseconds
 * - otherwise token replace: YYYY, MM, DD, HH, mm, ss (time components are "00",
 *   the source is date-only). With `endOfDay`, a format that carries a time
 *   renders the day's last second instead (23:59:59, or the matching epoch):
 *   a window's end on the same date as its start was otherwise the same
 *   instant, and an API taking timestamps returned nothing for a day-by-day
 *   request. Non-token characters pass through, but note: a
 *   literal substring matching a token (e.g. "mm" inside "comment") is also
 *   replaced, so use plain date-component formats without such literals.
 * A malformed date is returned unchanged (never throws).
 *
 * @param {string|null|undefined} dateStr - a YYYY-MM-DD string (or falsy)
 * @param {string|undefined} format
 * @param {{ endOfDay?: boolean }} [options]
 * @returns {string|null|undefined}
 */
export function formatCursorDate(dateStr, format, { endOfDay = false } = {}) {
  if (!dateStr) return dateStr;
  if (!format || format === 'YYYY-MM-DD') return dateStr;

  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return dateStr;

  const lastMs = endOfDay ? 86400000 - 1 : 0;
  if (format === 'X') return String(Math.floor((date.getTime() + lastMs) / 1000));
  if (format === 'x') return String(date.getTime() + lastMs);

  const pad = n => String(n).padStart(2, '0');
  return format
    .replaceAll('YYYY', String(date.getUTCFullYear()))
    .replaceAll('MM', pad(date.getUTCMonth() + 1))
    .replaceAll('DD', pad(date.getUTCDate()))
    .replaceAll('HH', endOfDay ? '23' : '00')
    .replaceAll('mm', endOfDay ? '59' : '00')
    .replaceAll('ss', endOfDay ? '59' : '00');
}
