export interface FormulaViolation {
  code: string;
  message: string;
  /** The calculated field the formula belongs to — every message names it (Global Constraints). */
  field: string;
  /**
   * WHAT INSIDE THE FORMULA the message is about — a reference label (`clicks`, `orders.amount`)
   * or a function name (`SUM`) — for a client that wants to point at it: an editor marker, a
   * highlight, a "jump to" affordance.
   *
   * Published as DATA rather than parsed back out of `message`, which silently coupled marker
   * placement to English wording: reword a sentence and markers land wrong or stop appearing, with
   * nothing failing anywhere.
   *
   * Absent when the violation is about the formula as a whole — there is no one token to blame, and
   * inventing one puts a marker somewhere arbitrary.
   */
  subject?: string;
}

export const FormulaViolations = {
  levelMixing: (field: string, column: string): FormulaViolation => ({
    code: 'FORMULA_LEVEL_MIXING',
    field,
    subject: column,
    message:
      `\`${column}\` is a row-level column, so it has no defined value once a report groups ` +
      `rows. Wrap it in an aggregation (SUM / COUNT / MIN / MAX).`,
  }),
  // Permanent, not a slice limit: the dedup CTE collapses each joined column
  // independently by its own aggregate, so a row-level read of two of them returns a tuple that
  // exists in no real row, and for a non-orderable type the collapse is not even stable within one
  // query. An aggregate call is the only reading that has a defined value.
  joinedReferenceOutsideAggregate: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_REFERENCE_ROW_LEVEL',
    field,
    subject: ref,
    message:
      `\`${ref}\` belongs to a joined Data Mart, which a formula can only read inside an ` +
      `aggregation (SUM / COUNT / MIN / MAX). Wrap it, or use a field of this Data Mart.`,
  }),
  aggregateMixesOwners: (field: string, fn: string, refs: string[]): FormulaViolation => ({
    code: 'FORMULA_AGGREGATE_MIXES_OWNERS',
    field,
    subject: fn,
    message:
      `\`${fn}\` combines ${refs.map(r => `\`${r}\``).join(' and ')}, which belong to different ` +
      `Data Marts. Split them into separate aggregations, e.g. ${fn}(…) / ${fn}(…).`,
  }),
  nestedAggregate: (field: string, fn: string): FormulaViolation => ({
    code: 'FORMULA_NESTED_AGGREGATE',
    field,
    subject: fn,
    message: `\`${fn}\` contains another aggregation. An aggregation cannot nest inside one.`,
  }),
  // A reference to an already-aggregated measure (e.g. Unique Count) may be used bare
  // at the metric's own aggregate level, but wrapping it in a further aggregate call double-counts
  // a number that is already per-group.
  aggregateOnAggregate: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_AGGREGATE_ON_AGGREGATE',
    field,
    subject: ref,
    message: `\`${ref}\` is already an aggregate and cannot be wrapped in another aggregation.`,
  }),
  // Same verdict and the same code as `aggregateOnAggregate` — a client keying on the code sees no
  // new outcome — but deliberately NOT the same sentence: told only "already an
  // aggregate", an analyst looking at a Unique Count measure has nothing to change, while one
  // looking at a calculated field has another formula to open. The wording is what carries that.
  calculatedFieldOnAggregate: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_AGGREGATE_ON_AGGREGATE',
    field,
    subject: ref,
    message:
      `\`${ref}\` is a calculated field that already aggregates, so it cannot be wrapped in ` +
      `another aggregation.`,
  }),
  // MUST be reported before aggregateWithoutField: an unclosed call also has an empty argument
  // span, so without this the user is told their COUNT has no field when the real fault is a
  // missing parenthesis.
  unbalancedParenthesis: (field: string, fn: string): FormulaViolation => ({
    code: 'FORMULA_UNBALANCED_PARENTHESIS',
    field,
    subject: fn,
    message: `\`${fn}\` has an opening parenthesis that is never closed.`,
  }),
  aggregateWithoutField: (field: string, fn: string): FormulaViolation => ({
    code: 'FORMULA_AGGREGATE_WITHOUT_FIELD',
    field,
    subject: fn,
    message: `\`${fn}\` references no field, so its Data Mart cannot be determined. Use ${fn}(field).`,
  }),
  subquery: (field: string): FormulaViolation => ({
    code: 'FORMULA_SUBQUERY_NOT_ALLOWED',
    field,
    message: 'A formula cannot contain a subquery.',
  }),
  window: (field: string): FormulaViolation => ({
    code: 'FORMULA_WINDOW_NOT_ALLOWED',
    field,
    message: 'Window functions (OVER) are not supported in a formula.',
  }),
  // A formula is an EXPRESSION spliced verbatim into a SELECT list, so `;` — the one character
  // that ends a statement and begins another — has no legitimate reading here.
  statementSeparator: (field: string): FormulaViolation => ({
    code: 'FORMULA_STATEMENT_SEPARATOR_NOT_ALLOWED',
    field,
    message:
      'A formula is a single expression and cannot contain `;`. Remove the semicolon — a formula ' +
      'never ends a statement.',
  }),
  // The same class as `;`, one nesting level down: a comma at depth 0 ends the EXPRESSION and
  // starts another one in the same SELECT list — an extra projected column, with this field's
  // output alias landing on the wrong one of the two.
  expressionSeparator: (field: string): FormulaViolation => ({
    code: 'FORMULA_EXPRESSION_SEPARATOR_NOT_ALLOWED',
    field,
    message:
      'A formula is a single expression and cannot contain a top-level `,`. Remove the comma — a ' +
      'comma between the arguments of a function, as in CONCAT(a, b), is fine.',
  }),
  // `#` and `//` are a CONTRADICTION between the warehouses, not a difference of degree. Measured:
  // `SELECT 5 # 3` returns 5 on BigQuery, where `#` opens a comment, and 6 on Redshift, where it is
  // bitwise XOR; `SELECT 1 + 2 # + 100` returns 3 and 103. `//` opens a comment on Snowflake and is
  // a syntax error on the other four.
  //
  // One lexical model for five dialects must be wrong somewhere, and the reading it picks is wrong
  // in the worst direction: treating the marker as CODE means the analyzer validates a tail the
  // warehouse silently drops, so the dry run passes and the report is quietly missing part of its
  // own formula.
  //
  // Refused rather than interpreted. `--` means the same thing on all five, so the cost is one
  // comment syntax with a plain alternative; the alternative to refusing is a wrong number nobody
  // can see.
  dialectAmbiguousMarker: (field: string, marker: string): FormulaViolation => ({
    code: 'FORMULA_DIALECT_AMBIGUOUS_MARKER_NOT_ALLOWED',
    field,
    subject: marker,
    message:
      `\`${marker}\` opens a comment on some of the supported warehouses and is an operator, or an ` +
      'error, on others — so the same formula would compute different things depending on which ' +
      'Data Mart it belongs to. Use `--` for a comment: it means the same thing everywhere.',
  }),
  // The same shape as `#`: four warehouses read `\\'` as an escaped quote (measured), Athena/Trino
  // does not, so the two readings put the closing quote in DIFFERENT PLACES. The side that ends the
  // literal early executes the rest of the formula as code while this analyzer sees one inert string
  // token — every structural guard blind at once.
  //
  // A literal quote is still writable as `''`, which the scanner and the warehouse agree about.
  dialectAmbiguousEscape: (field: string): FormulaViolation => ({
    code: 'FORMULA_DIALECT_AMBIGUOUS_ESCAPE_NOT_ALLOWED',
    field,
    message:
      'A formula cannot contain a backslash inside a quoted value: some of the supported ' +
      'warehouses read it as an escape and others read it as an ordinary character, so the text ' +
      'would end in different places depending on the Data Mart. Write a quote as two quotes ' +
      "('') instead.",
  }),
  // The same family as the two above, reached without any ambiguous character at all: a quoting
  // spelling this scanner does not know (`$$…$$` on Snowflake, `'''…'''` on BigQuery) leaves an odd
  // quote behind, the run never closes, and ONE token covers the rest of the formula. Verified:
  // `'''don't''' , other_col` and `LENGTH($$it's$$) , other_col` both pass every guard today, and
  // the warehouse — which closes the text elsewhere — reads a second select item, so the report
  // gains a column and, on the grouping path, a GROUP BY key.
  unterminatedQuotedText: (field: string): FormulaViolation => ({
    code: 'FORMULA_UNTERMINATED_QUOTED_TEXT_NOT_ALLOWED',
    field,
    message:
      'A formula cannot leave a quoted value or a comment unclosed. Everything after the opening ' +
      'mark is read as text here, while the warehouse ends the text somewhere else, so the rest ' +
      'of the formula would run as SQL nothing has checked. Close it — a quote inside text is ' +
      "written as two quotes ('').",
  }),
  unknownReference: (field: string, ref: string, state: string): FormulaViolation => ({
    code: 'FORMULA_UNKNOWN_REFERENCE',
    field,
    subject: ref,
    message: `\`${ref}\` ${state === 'missing' ? 'no longer exists in the Data Mart' : 'cannot be resolved'}.`,
  }),
  // JOINED only: a formula may read another calculated field of its OWN Data
  // Mart, and the sentence has to say which one is refused — told merely "a formula cannot
  // reference another one", an analyst has no reason to try the thing that now works.
  calculatedReference: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_CALCULATED_REFERENCE',
    field,
    subject: ref,
    message:
      `\`${ref}\` is a calculated field of a joined Data Mart. A formula can only reference a ` +
      `calculated field of its own Data Mart.`,
  }),
  // A loop of ONE field. Its own constructor rather than a chain of length one because the analyst's
  // situation is different: everything they need is in the formula in front of them, and "`a` → `a`"
  // would be a diagram of a typo.
  selfReference: (field: string): FormulaViolation => ({
    code: 'FORMULA_CIRCULAR_REFERENCE',
    field,
    subject: field,
    message:
      `\`${field}\` references itself, so it has no value to compute. Reference the fields it is ` +
      `calculated from instead.`,
  }),
  // A loop of several. `chain` is closed (`a`, `b`, `a`), and the reference this field contributes
  // to it — the token the editor can point at, and the one the analyst can actually delete — is
  // whatever follows this field on it.
  circularReference: (field: string, chain: readonly string[]): FormulaViolation => {
    const next = chain[chain.indexOf(field) + 1] ?? field;
    return {
      code: 'FORMULA_CIRCULAR_REFERENCE',
      field,
      subject: next,
      message:
        `\`${next}\` leads back to \`${field}\`, so these calculated fields depend on each other ` +
        `and none of them has a value: ${chain.map(name => `\`${name}\``).join(' → ')}. Remove ` +
        `one of the references in that loop.`,
    };
  },
  // A joined path is resolved through the relationship tree the report builder itself reads (the
  // blendable schema), so the ways it can fail are reported apart: the source is not there at all,
  // the source is there but the field cannot be used, the Unique Count measure this slice still
  // cannot render, and a save with no identity to check any of it.
  joinedPathNotFound: (field: string, ref: string, path: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_PATH_NOT_FOUND',
    field,
    subject: ref,
    message:
      `\`${ref}\` reads from \`${path}\`, which is not joined to this Data Mart. The join may ` +
      `have been removed, or its alias renamed — point the formula at a joined Data Mart that ` +
      `exists.`,
  }),
  // NOT a violation: a source EXCLUDED from reporting. Its join is still built unconditionally
  // (`buildRelationshipChains`), which is what lets a report sort by an excluded source's column,
  // so refusing one only inside a formula would be an asymmetry with no reason behind it.
  joinedFieldHidden: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_FIELD_NOT_AVAILABLE',
    field,
    subject: ref,
    message: `\`${ref}\` cannot be used: that field is hidden from reporting in its Data Mart.`,
  }),
  joinedFieldUnknown: (field: string, ref: string, path: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_FIELD_NOT_AVAILABLE',
    field,
    subject: ref,
    message: `\`${ref}\` cannot be used: \`${path}\` offers no such field.`,
  }),
  // Two visible joined fields whose `(aliasPath, originalFieldName)` pairs fold to ONE unified
  // blended name — the `__` separator is legal inside both halves. `buildBlendedFieldIndex` refuses
  // to resolve such a name, so accepting the reference here only moves the failure to a report run,
  // where it arrives as a whole-request 400 naming no metric.
  joinedFieldAmbiguous: (field: string, ref: string, unifiedName: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_FIELD_AMBIGUOUS',
    field,
    subject: ref,
    message:
      `\`${ref}\` cannot be used: it and another joined field both map to the blended column ` +
      `\`${unifiedName}\`, so a report cannot tell them apart. Rename one of the conflicting join ` +
      `aliases or fields.`,
  }),
  // The composer refuses this too, but as a whole-request envelope ("missing access to data
  // marts: …") that names no field — the metric dialog renders per-field violations, so it would
  // surface as a generic toast. Same verdict, in the shape the analyst can act on.
  joinedSourceNotAccessible: (field: string, ref: string, path: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_SOURCE_NOT_ACCESSIBLE',
    field,
    subject: ref,
    message:
      `\`${ref}\` reads from \`${path}\`, a joined Data Mart you do not have access to. Ask for ` +
      `access to it, or reference a Data Mart you can read.`,
  }),
  // A save with no user identity cannot read the join tree (that read is per-user), so it cannot
  // tell a good path from a stale one. Refused rather than saved unchecked: an unverified path
  // survives the save and then fails on a REPORT RUN, as a sleeve joined to a CTE that was never
  // built — a long way from the mistake, and by then nobody is looking at this formula.
  joinedReferenceUnverified: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_REFERENCE_UNVERIFIED',
    field,
    subject: ref,
    message:
      `\`${ref}\` references a joined Data Mart, and this save cannot check that it still ` +
      `resolves. Save the schema from the Data Mart editor, where it can be verified.`,
  }),
  // Mechanically a joined Unique Count is a sleeve output, so the objection that rules out the
  // MAIN Data Mart's own measure (below) does not apply to it — it is left out of this slice by
  // decision, not by impossibility, so it gets its own code rather than being folded into either
  // "no such field" or the main-measure refusal.
  joinedUniqueCountReference: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_JOINED_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
    field,
    subject: ref,
    message:
      `\`${ref}\` is a joined Data Mart's Unique Count measure, which a formula cannot reference ` +
      `yet. Select it as a report column instead, or reference one of that Data Mart's fields.`,
  }),
  // A BARE `unique_count` — no `path` — has no legitimate reading: there is no such column, and the
  // measure is a SELECT alias of the very query the formula renders into, which no dialect can
  // reference from inside its own SELECT list.
  mainUniqueCountReference: (field: string, ref: string): FormulaViolation => ({
    code: 'FORMULA_MAIN_UNIQUE_COUNT_REFERENCE_NOT_SUPPORTED',
    field,
    subject: ref,
    message:
      `\`${ref}\` is not a column of this Data Mart — it reads as the Data Mart's own Unique ` +
      `Count measure, which a formula cannot reference: the measure is computed as an output ` +
      `column of the same query, and no warehouse can resolve one from inside that query. ` +
      `Reference a real field instead.`,
  }),
  tagInStringLiteral: (field: string): FormulaViolation => ({
    code: 'FORMULA_TAG_IN_STRING_LITERAL',
    field,
    message: 'A field reference cannot appear inside a text value.',
  }),
  syntax: (field: string, detail: string): FormulaViolation => ({
    code: 'FORMULA_SYNTAX',
    field,
    message: detail,
  }),
  unguardedDivision: (field: string): FormulaViolation => ({
    code: 'FORMULA_UNGUARDED_DIVISION',
    field,
    message:
      'This formula divides without guarding against a zero or empty denominator. ' +
      'Wrap it, e.g. NULLIF(SUM(impressions), 0).',
  }),
  // Used by the dry-run pass. Defined here so every message this feature can emit
  // lives in one file.
  warehouseRejected: (field: string, detail?: string): FormulaViolation => ({
    code: 'FORMULA_WAREHOUSE_REJECTED',
    field,
    message: `The warehouse rejected this formula: ${detail ?? 'no details returned'}`,
  }),
  // The combined dry run failed but every metric passed AGAIN when re-run in isolation — the set
  // only conflicts when run TOGETHER (e.g. two formulas that collide on the same alias). Still
  // needs a field to attach to (every violation names one — Global Constraints), but the wording
  // must not imply that field's OWN formula is what's broken, unlike `warehouseRejected` above.
  warehouseRejectedAsSet: (field: string, detail?: string): FormulaViolation => ({
    code: 'FORMULA_WAREHOUSE_REJECTED',
    field,
    message:
      `These calculated fields could not be validated together by the warehouse: ` +
      `${detail ?? 'no details returned'}. Each formula passed individually — the conflict only ` +
      `appears when they run as a set.`,
  }),
  // Says the list was CUT rather than letting it end silently: a short list of collateral reads as
  // "and that is all of it", which is the one thing a truncated one is not.
  otherFieldErrorsTruncated: (field: string, omitted: number): FormulaViolation => ({
    code: 'FORMULA_OTHER_FIELD_ERRORS_TRUNCATED',
    field,
    message:
      `${String(omitted)} more problem${omitted === 1 ? '' : 's'} in other calculated fields ` +
      `${omitted === 1 ? 'is' : 'are'} not listed here. Open those fields, or save to see them all.`,
  }),
  warehouseCheckSkipped: (fields: readonly string[]): FormulaViolation => ({
    code: 'FORMULA_WAREHOUSE_CHECK_SKIPPED',
    field: fields[0] ?? '',
    message:
      `Saved without checking ${fields.map(f => `\`${f}\``).join(', ')} against the warehouse — ` +
      `it was unreachable. The check runs again on the next save.`,
  }),
};
