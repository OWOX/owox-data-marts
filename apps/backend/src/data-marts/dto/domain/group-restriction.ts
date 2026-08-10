import { DateTruncRule } from '../schemas/date-trunc-config.schema';
import { FilterRule } from '../schemas/filter-config.schema';

/**
 * Restricts a Totals query to the rows of the GROUPS its report keeps.
 *
 * Totals have no GROUP BY, so the report's metric (HAVING) filters have nothing to filter there
 * — and dropping them makes Totals summarise rows the report itself hides. The builders instead
 * recompute the surviving groups over the SAME source and semi-join them: a GROUP BY result has
 * distinct tuples, so it filters rows without duplicating any, and every metric is then computed
 * over the surviving ROWS. That is what keeps a symmetric aggregate right — an entity present in
 * two surviving groups still counts once.
 *
 * ONE declaration shared by the read plan, the flat query options and the blended context: the
 * three carry the same tuple to two independent renderers, and a field added to only one of them
 * (as `dateTruncs` was, at first) silently changes the grain the HAVING is evaluated at.
 */
export interface GroupRestriction {
  /** The report's own dimensions — the grain its HAVING filtered. */
  dimensions: string[];
  /** The rules carrying a `function`; the WHERE rules stay in `filters`. */
  having: FilterRule[];
  /**
   * The report's own date buckets for those dimensions. REQUIRED for correctness, not an
   * optimisation: a Totals query carries no `dateTruncs` of its own (it has no GROUP BY), so
   * without them the surviving groups would be recomputed at the RAW grain — `GROUP BY date`
   * where the report grouped by month — and a month whose total clears the filter can have no
   * single day that does. Omitted only when the report has no date bucket at all.
   */
  dateTruncs?: DateTruncRule[];
}
