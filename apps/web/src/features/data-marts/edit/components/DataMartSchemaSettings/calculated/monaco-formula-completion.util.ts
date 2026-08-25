import type * as monaco from 'monaco-editor';
import type { CalculatedFieldLevel } from '../../../../shared/types/data-mart-schema.types';
import { isRowLevelCalculatedField } from '../../../../shared/utils/calculated-field-level';
import type { ReferenceableField } from './formula-reference-index';
import { GUARDED_DIVISION_SNIPPET } from './formula-function-dialects';
import { SCALAR_WORD_OPERATORS } from './formula-scalar-functions';

/** `IS NULL` and friends complete as words; everything else completes as a call. */
const WORD_OPERATORS = new Set(SCALAR_WORD_OPERATORS);

/**
 * How a calculated candidate's level reads in the menu. The backend's own words for the two
 * outcomes — "already aggregates" and "is a row-level column" — condensed to what fits beside a
 * field name, so the row and the refusal an analyst may meet next use the same vocabulary.
 */
const CALCULATED_LEVEL_LABELS: Record<CalculatedFieldLevel, string> = {
  metric: 'aggregated formula',
  column: 'row-level formula',
};

/**
 * A LABEL may guess where the chip hover may not (formula-reference-source.ts): a formula applied
 * in this session carries no derived level, and reading that as an aggregate is the same quiet
 * default the rest of the web takes — it withholds an aggregation the analyst might have used
 * rather than inviting one the save refuses, and the row still says "this is a formula" either way.
 */
function calculatedLabelFor(calculated: { level?: CalculatedFieldLevel }): string {
  return CALCULATED_LEVEL_LABELS[isRowLevelCalculatedField(calculated) ? 'column' : 'metric'];
}

export const WORD_TRIGGER_CHARACTERS = [
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789',
];

const providerDisposableByKey = new WeakMap<typeof monaco, Map<string, monaco.IDisposable[]>>();

/**
 * Autocomplete for the formula editor. Unlike the insight template editor's `{{ }}` tag detection,
 * a formula never has a syntax marker to key off — every word character is a trigger.
 *
 * Four sources, in menu order:
 * 1. every referenceable field (hidden and calculated included) from `getIndex()`, each row
 *    carrying its name, its type and what qualifies it — Data Mart, level, hidden — in Monaco's
 *    three label slots rather than in one packed `detail` string;
 * 2. the guarded-division snippet. Spec decision 6 downgraded unguarded division from an error to
 *    a warning on the stated grounds that the validator warns AND autocomplete offers the guarded
 *    form — so this entry is half of that bargain, not decoration;
 * 3. the aggregate functions the BACKEND parser recognizes for this storage (`getFunctions()`).
 *    Only those: a function the parser does not know as an aggregate makes its arguments read as
 *    bare row-level columns and fails the level-mixing rule, so suggesting a name the backend has
 *    never heard of would actively mislead.
 * 4. scalar functions for this storage (`getScalarFunctions()`), last. Point 3's restriction does
 *    not carry over and does not contradict this: it is about names that must be RECOGNIZED AS
 *    AGGREGATES, whereas the parser lets every non-aggregate call through untouched and leaves
 *    "does this function exist" to the warehouse dry run. So this group may — and must — offer
 *    names no backend list holds; it is a suggestion, never a claim about what is legal.
 *
 * Guarded the same way `registerTemplateSlashCommandProvider` guards itself
 * (`insights/utils/monaco-template-commands.util.ts`): the Data Mart SQL definition editor also
 * mounts with `language='sql'` and can be on the same page as this editor, so without a dedupe
 * guard a mounted FormulaEditor would leak its field completions into that unrelated editor too.
 * Deduping is only half of it — Monaco asks EVERY provider registered for the language, whichever
 * editor it came from — so the same `model !== getModel()` guard `registerFormulaHoverProvider`
 * applies is what keeps this editor's schema fields out of that unrelated SQL editor's menu.
 */
export function registerFormulaCompletionProvider(
  monacoInstance: typeof monaco,
  languageId: string,
  getModel: () => monaco.editor.ITextModel | null,
  getIndex: () => readonly ReferenceableField[],
  getFunctions: () => readonly string[] = () => [],
  getScalarFunctions: () => readonly string[] = () => []
): () => void {
  const map =
    providerDisposableByKey.get(monacoInstance) ?? new Map<string, monaco.IDisposable[]>();
  if (!providerDisposableByKey.has(monacoInstance)) {
    providerDisposableByKey.set(monacoInstance, map);
  }

  const previousDisposables = map.get(languageId);
  if (previousDisposables) {
    previousDisposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
  }

  const provider = monacoInstance.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: WORD_TRIGGER_CHARACTERS,
    provideCompletionItems: (model, position) => {
      if (model !== getModel()) return null;
      const line = position.lineNumber;
      const column = position.column;
      const textUntilPosition = model.getValueInRange({
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: column,
      });

      const wordMatch = /[\w.]*$/.exec(textUntilPosition);
      const prefixLength = wordMatch ? wordMatch[0].length : 0;
      const range = {
        startLineNumber: line,
        endLineNumber: line,
        startColumn: column - prefixLength,
        endColumn: column,
      };

      const typedLow = textUntilPosition.toLowerCase();

      /**
       * The range an entry whose label holds a SPACE has to replace — `IS NOT NULL`, `guarded
       * division`. The word regex above stops at a space, so once the analyst has typed `x IS N`
       * the default range covers `N` alone and accepting `IS NOT NULL` would leave
       * `x IS IS NOT NULL`. Widen it to however much of the phrase is already typed.
       *
       * Two bounds, because a range that is wrong in the other direction eats the analyst's text:
       * it never NARROWS below the typed word (`abcIS` keeps the whole word, so no entry can
       * replace a word's tail and leave its head behind), and it never starts INSIDE the previous
       * identifier — `CASE WHEN analysis ` ends with `is `, and without the boundary check
       * accepting `IS NULL` there would produce `CASE WHEN analysIS NULL`.
       *
       * Only prefix-aligned typing is covered, deliberately: `x NOT N` and `x IS  N` (two spaces)
       * are not prefixes of `IS NOT NULL`, so those still fall back to the plain word range and
       * still insert the phrase whole. Closing those would mean guessing which typed words the
       * analyst meant as part of the phrase.
       *
       * No `filterText` is needed to keep the entry visible mid-phrase — Monaco derives each item's
       * filter word from that item's own range start, so a widened range widens the word it is
       * matched against too.
       */
      const rangeFor = (label: string) => {
        if (!label.includes(' ')) return range;
        const labelLow = label.toLowerCase();
        for (let len = Math.min(labelLow.length, typedLow.length); len > prefixLength; len--) {
          if (!labelLow.startsWith(typedLow.slice(typedLow.length - len))) continue;
          // Index rather than the character: at the start of the line there is nothing before the
          // match, and this app's TS has no `noUncheckedIndexedAccess`, so an `=== undefined`
          // check on the character reads to the linter as dead code.
          const beforeIndex = typedLow.length - len - 1;
          if (beforeIndex < 0 || !/[\w.]/.test(typedLow[beforeIndex])) {
            return { ...range, startColumn: column - len };
          }
        }
        return range;
      };

      // A single `sortText` namespace across all four groups: Monaco sorts the whole list by it,
      // so the group prefix is what keeps fields above the snippet above the functions no matter
      // how the label sorts alphabetically.
      const order = (group: number, i: number) => `${group}${String(i).padStart(4, '0')}`;

      const fields = getIndex().map((entry, i) => {
        // Everything about a candidate except its name and type shares one slot, because all of it
        // answers the same question: where does this come from, and may I use it as it stands?
        // A joined candidate names its Data Mart (`orders.amount` and `order_items.amount` are
        // told apart by the alias alone otherwise, and an alias is not what the analyst knows the
        // Data Mart by). A calculated one names its LEVEL, which is what decides whether it may be
        // written bare or has to be wrapped in an aggregation. Only the last two can co-occur: a
        // joined field is never hidden here and never calculated (neither is offered at all).
        const description = [
          entry.sourceLabel,
          entry.calculated ? calculatedLabelFor(entry.calculated) : undefined,
          entry.isHidden ? 'hidden' : undefined,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          // The object form of `label`, not a string: Monaco renders `label` as the name,
          // `label.detail` muted right beside it, and `label.description` right-aligned — whereas
          // a string label's `detail` puts every fact in the right-aligned slot, where `FLOAT ·
          // Orders` reads as one phrase. Filtering is unaffected: Monaco matches typing against
          // `label.label`.
          label: {
            label: entry.name,
            // Monaco renders `detail` flush against `label` — its own convention is a signature like
            // `foo(a, b)`, where no gap is wanted. Ours is a type, so it needs one. A NO-BREAK space
            // rather than a plain one: an ordinary leading space collapses in the widget's inline
            // layout and the row reads `session_idSTRING`.
            detail: `\u00A0${entry.type}`,
            // Spread, so a field with no Data Mart and nothing to flag has no `description` key at
            // all rather than an explicit `undefined`.
            ...(description ? { description } : {}),
          },
          insertText: entry.name,
          kind: monacoInstance.languages.CompletionItemKind.Field,
          range,
          sortText: order(0, i),
        };
      });

      const guardedDivision = {
        label: GUARDED_DIVISION_SNIPPET.label,
        insertText: GUARDED_DIVISION_SNIPPET.insertText,
        insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: GUARDED_DIVISION_SNIPPET.detail,
        documentation: GUARDED_DIVISION_SNIPPET.documentation,
        kind: monacoInstance.languages.CompletionItemKind.Snippet,
        // Its label is two words, so it has the same trap as `IS NOT NULL`.
        range: rangeFor(GUARDED_DIVISION_SNIPPET.label),
        sortText: order(1, 0),
      };

      const functions = getFunctions().map((name, i) => ({
        label: name,
        // The caret lands between the parentheses — a formula's aggregate always takes an
        // argument, and the next thing typed is the field name.
        insertText: `${name}($0)`,
        insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: 'aggregation',
        kind: monacoInstance.languages.CompletionItemKind.Function,
        range,
        sortText: order(2, i),
      }));

      const scalarFunctions = getScalarFunctions().map((name, i) => {
        const isWord = WORD_OPERATORS.has(name);
        return {
          label: name,
          // `AND`, `IS NULL`, `CASE` and the rest of the CASE keywords are words, not calls —
          // completing them into `AND()` would make the analyst delete the parentheses every time.
          insertText: isWord ? name : `${name}($0)`,
          insertTextRules: isWord
            ? undefined
            : monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'function',
          kind: monacoInstance.languages.CompletionItemKind.Function,
          // The only group whose entries can hold a space (`IS NULL`, `IS NOT NULL`).
          range: rangeFor(name),
          sortText: order(3, i),
        };
      });

      return {
        suggestions: [...fields, guardedDivision, ...functions, ...scalarFunctions],
        isIncomplete: false,
      };
    },
  });

  const disposables = [provider];
  map.set(languageId, disposables);

  return () => {
    disposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
    // Only while the entry is still THIS registration's: a second editor overwrote it when it
    // mounted, and deleting that one would leave the next registration nothing to dispose — so
    // the second editor's provider would stay registered for good, duplicating every suggestion.
    if (map.get(languageId) === disposables) map.delete(languageId);
  };
}
