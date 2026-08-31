import Handlebars from 'handlebars';

export interface FormulaReference {
  /** aliasPath relative to the metric's OWN Data Mart; '' means that Data Mart itself. */
  path: string;
  /** The field's original, possibly dotted, name — never a folded unified id. */
  field: string;
  start: number;
  end: number;
}

export class FormulaReferenceSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(message);
    this.name = 'FormulaReferenceSyntaxError';
  }
}

const TAG = 'ref';

export function serializeFormulaReference(ref: { path: string; field: string }): string {
  assertRepresentable('path', ref.path);
  assertRepresentable('field', ref.field);
  const path = ref.path ? ` path="${ref.path}"` : '';
  return `{{${TAG}${path} field="${ref.field}"}}`;
}

/**
 * What a `{{ref}}` hash value may hold, decided by what the PARSER above can read back.
 *
 * Handlebars unescapes `\"` and leaves every other backslash literal, so a TRAILING one has no
 * escape available: it runs into the closing quote and the lexer reads on through the rest of the
 * formula. Refused here rather than at either caller, because canonicalization and the alias-rename
 * cascade both re-serialize and PERSIST the result with nothing in between to reject it.
 *
 * Only the last character is ambiguous — an interior backslash round-trips, so `a\b` stays legal.
 */
function assertRepresentable(kind: 'path' | 'field', value: string): void {
  if (value.includes('"')) {
    throw new FormulaReferenceSyntaxError(
      `${kind} must not contain a double quote: ${JSON.stringify(value)}`,
      0
    );
  }
  if (value.endsWith('\\')) {
    throw new FormulaReferenceSyntaxError(
      `${kind} must not end with a backslash — no reference tag can represent it: ${JSON.stringify(value)}`,
      0
    );
  }
}

/**
 * Handlebars is used as a PARSER, never as a renderer: `parse()` yields an AST with source
 * positions and hash params, while `compile()` would escape HTML and expose helpers, sections and
 * partials we neither need nor want. Same approach as TemplateToPlaceholderTagsConverterService.
 */
export function parseFormulaReferences(stored: string): FormulaReference[] {
  const lineOffsets = buildLineOffsets(stored);
  let ast;
  try {
    ast = Handlebars.parse(stored);
  } catch (e) {
    throw new FormulaReferenceSyntaxError((e as Error).message, 0);
  }

  const refs: FormulaReference[] = [];
  for (const node of ast.body) {
    if (node.type === 'ContentStatement') continue;
    if (node.type !== 'MustacheStatement') {
      throw new FormulaReferenceSyntaxError(
        `Only {{${TAG} …}} tags are allowed in a formula`,
        positionToOffset(node.loc.start, lineOffsets)
      );
    }
    const mustache = node as hbs.AST.MustacheStatement;
    const name = (mustache.path as hbs.AST.PathExpression).original;
    if (name !== TAG) {
      throw new FormulaReferenceSyntaxError(
        `Unknown tag {{${name}}}; only {{${TAG} …}} is allowed`,
        positionToOffset(node.loc.start, lineOffsets)
      );
    }
    if (!mustache.escaped) {
      throw new FormulaReferenceSyntaxError(
        `{{{${TAG} …}}} triple-stash is not allowed; use {{${TAG} …}}`,
        positionToOffset(node.loc.start, lineOffsets)
      );
    }
    const pairs = new Map<string, string>();
    for (const pair of mustache.hash?.pairs ?? []) {
      if (pair.value.type !== 'StringLiteral') {
        throw new FormulaReferenceSyntaxError(
          `{{${TAG}}} "${pair.key}" must be a quoted string`,
          positionToOffset(pair.loc.start, lineOffsets)
        );
      }
      pairs.set(pair.key, (pair.value as hbs.AST.StringLiteral).value);
    }
    const field = pairs.get('field');
    if (!field) {
      throw new FormulaReferenceSyntaxError(
        `{{${TAG}}} requires a field`,
        positionToOffset(node.loc.start, lineOffsets)
      );
    }
    refs.push({
      path: pairs.get('path') ?? '',
      field,
      start: positionToOffset(node.loc.start, lineOffsets),
      end: positionToOffset(node.loc.end, lineOffsets),
    });
  }
  return refs;
}

export function renderFormula(stored: string, resolve: (ref: FormulaReference) => string): string {
  return renderFormulaWithReplacements(stored, resolve, []);
}

/** A `[start, end)` span of the stored formula to swap for `sql`, e.g. a joined aggregate call
 *  replaced by its sleeve pull. Spans must not overlap; refs inside a span are not rendered. */
export interface FormulaSpanReplacement {
  start: number;
  end: number;
  sql: string;
}

/**
 * Throws if two replacements overlap each other, or if a replacement partially straddles a
 * reference instead of fully containing it — both are caller bugs that would otherwise silently
 * mis-render SQL (e.g. a dropped or duplicated slice of `stored`).
 */
export function renderFormulaWithReplacements(
  stored: string,
  resolve: (ref: FormulaReference) => string,
  replacements: readonly FormulaSpanReplacement[]
): string {
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error(
        `Overlapping formula span replacements: [${sorted[i - 1].start}, ${sorted[i - 1].end}) and ` +
          `[${sorted[i].start}, ${sorted[i].end})`
      );
    }
  }

  const refs = parseFormulaReferences(stored);

  for (const ref of refs) {
    for (const span of sorted) {
      const intersects = ref.start < span.end && span.start < ref.end;
      const fullyContained = ref.start >= span.start && ref.end <= span.end;
      if (intersects && !fullyContained) {
        throw new Error(
          `Formula reference at [${ref.start}, ${ref.end}) partially overlaps replacement span ` +
            `[${span.start}, ${span.end}); a replacement must fully contain any reference it covers`
        );
      }
    }
  }

  let out = '';
  let cursor = 0;
  let ri = 0;

  for (const ref of refs) {
    // A replacement that ends at or before this ref starts is fully resolved; emit it now.
    while (ri < sorted.length && sorted[ri].end <= ref.start) {
      out += stored.slice(cursor, sorted[ri].start) + sorted[ri].sql;
      cursor = sorted[ri].end;
      ri++;
    }
    // A ref nested inside the pending replacement's span is covered by that replacement's sql.
    if (ri < sorted.length && ref.start >= sorted[ri].start && ref.start < sorted[ri].end) {
      continue;
    }
    out += stored.slice(cursor, ref.start) + resolve(ref);
    cursor = ref.end;
  }

  while (ri < sorted.length) {
    out += stored.slice(cursor, sorted[ri].start) + sorted[ri].sql;
    cursor = sorted[ri].end;
    ri++;
  }

  return out + stored.slice(cursor);
}

/**
 * A calculated field re-entered while it was still being expanded. Carries the field and the whole
 * chain so a caller can convert it into a refusal that NAMES the formula to open — the same
 * discipline `analyzeFormula` applies to `FormulaReferenceSyntaxError`, and for the same reason:
 * the alternative here is an unguarded infinite recursion, i.e. a 500 with no field name at all.
 */
export class FormulaCycleError extends Error {
  constructor(
    readonly field: string,
    /** The loop that closed, its first field repeated at the end: `a` → `b` → `a`. */
    readonly chain: readonly string[]
  ) {
    super(`Circular formula reference: ${chain.join(' → ')}`);
    this.name = 'FormulaCycleError';
  }
}

/**
 * The calculated fields currently being expanded, carried ACROSS re-entries of the renderer.
 *
 * A depth counter inside `renderFormulaWithReplacements` cannot see this recursion: it runs as
 * `resolve → render(B) → resolve → …`, and every re-entry is a fresh call starting at zero. A stack
 * rather than a set, because the refusal has to name the loop and popping on the way out is what
 * keeps a DIAMOND legal.
 */
/**
 * Total rendered text one top-level expansion may produce, summed over every intermediate
 * substitution. Generous: a legitimate chain lands orders of magnitude below it. What it stops is
 * the shape below, where the number is not large but exponential.
 */
export const FORMULA_EXPANSION_MAX_LENGTH = 200_000;

export class FormulaExpansionTooLargeError extends Error {
  constructor(
    readonly field: string,
    readonly budget: number
  ) {
    super(`Formula expansion exceeded ${budget} characters at '${field}'`);
    this.name = 'FormulaExpansionTooLargeError';
  }
}

export class FormulaExpansionGuard {
  private readonly expanding: string[] = [];
  private spent = 0;

  constructor(private readonly budget: number = FORMULA_EXPANSION_MAX_LENGTH) {}

  /** The loop that would close if `field` were expanded now, or `undefined` when it is free. */
  cycleFor(field: string): string[] | undefined {
    const at = this.expanding.indexOf(field);
    return at === -1 ? undefined : [...this.expanding.slice(at), field];
  }

  /**
   * Charges rendered text against the whole expansion's budget, and refuses once it is spent.
   *
   * The cycle guard pops on the way out so a DIAMOND stays legal, and that is what makes the size
   * unbounded: `a2 = a1 + a1`, `a3 = a2 + a2`, … doubles the OUTPUT at every level. Six such
   * formulas, each comfortably inside `CALCULATED_FORMULA_MAX_LENGTH`, reach past V8's string limit
   * — the event loop blocks and the pod dies, taking every co-tenant with it, on every report run
   * rather than only at save.
   *
   * Memoising a dependency's rendered text cuts the WORK but not the SIZE, since the parent's own
   * text still contains its child's twice. Charged cumulatively, so the refusal arrives before the
   * huge string is built rather than after.
   */
  charge(field: string, rendered: string): string {
    this.spent += rendered.length;
    if (this.spent > this.budget) throw new FormulaExpansionTooLargeError(field, this.budget);
    return rendered;
  }

  expand<T>(field: string, render: () => T): T {
    const cycle = this.cycleFor(field);
    if (cycle) throw new FormulaCycleError(field, cycle);
    this.expanding.push(field);
    try {
      return render();
    } finally {
      this.expanding.pop();
    }
  }
}

export interface FormulaDependencyWalk {
  /**
   * Every field of the graph, each after all of its dependencies — and ABSENT whenever `cycles` is
   * non-empty, so a caller cannot read one that is not topological. It used to come back anyway:
   * `{a:[b], b:[a], c:[a]}` yielded `['b','a','c']`, plausible and wrong. The one consumer derives
   * each field's LEVEL in this order, and a wrong level is a wrong GROUP BY and a wrong number.
   */
  order?: string[];
  /** One entry per loop, each a closed chain in `FormulaCycleError.chain`'s shape. */
  cycles: string[][];
}

/**
 * Depth-first walk of `field name → the calculated fields its formula reads`, answering both halves
 * of one question: which loops the graph holds, and — when it holds none — an order in which it can
 * be resolved. They are one computation, not two: an order exists exactly when no loop does.
 *
 * A dependency that is not itself a key is a leaf (an ordinary column) and is never ordered. The
 * guard above supplies the stack, so save time and compose time decide "is this a cycle" identically.
 */
export function walkFormulaDependencies(
  dependencies: ReadonlyMap<string, readonly string[]>
): FormulaDependencyWalk {
  const guard = new FormulaExpansionGuard();
  const resolved = new Set<string>();
  const order: string[] = [];
  const cycles: string[][] = [];

  const visit = (field: string): void => {
    if (resolved.has(field)) return;
    const cycle = guard.cycleFor(field);
    if (cycle) {
      cycles.push(cycle);
      return;
    }
    guard.expand(field, () => {
      for (const dependency of dependencies.get(field) ?? []) {
        if (dependencies.has(dependency)) visit(dependency);
      }
    });
    resolved.add(field);
    order.push(field);
  };

  for (const field of dependencies.keys()) visit(field);
  return cycles.length > 0 ? { cycles } : { order, cycles };
}

/**
 * Mirrors Handlebars' own line-break rule (see its lexer's newline regex, which matches a CRLF
 * pair, a lone CR, or an LF alike): `\r\n`, a lone `\r`, and `\n` all start a new line. Splitting
 * on `\n` alone would desync `loc.line` from this table the moment stored text contains a bare
 * `\r`.
 */
function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      offsets.push(i + 1);
    } else if (ch === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function positionToOffset(position: hbs.AST.Position, lineOffsets: number[]): number {
  const offset = lineOffsets[position.line - 1] + position.column;
  if (!Number.isFinite(offset)) {
    throw new FormulaReferenceSyntaxError(
      `Could not resolve a source offset for line ${position.line}, column ${position.column}`,
      0
    );
  }
  return offset;
}
