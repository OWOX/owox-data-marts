import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { EditableText } from '@owox/ui/components/common/editable-text';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@owox/ui/components/hover-card';
import { useDraftCalculatedFields } from './draft-calculated-fields';
import { toAuthoringForm, toStoredForm, type ResolvedReference } from './formula-authoring';
import { FormulaChips } from './FormulaChips';
import { refDisplayName } from './formula-reference-display-name';
import {
  buildCalculatedFieldIndex,
  buildSourceLabelIndex,
  describeReferenceSource,
} from './formula-reference-source';
import type { ReferenceableField } from './formula-reference-index';
import {
  describeUnresolvedIdentifiers,
  findUnresolvedIdentifiers,
} from './formula-unresolved-identifiers';
import { FormulaEditor, type FormulaEditorProps } from './FormulaEditor';
import type { JoinedFieldsStatus } from './joined-fields-context';
import { useFormulaDiagnostics } from './useFormulaDiagnostics';

export interface CalculatedFieldFormulaCellProps {
  /** The metric's formula in STORED form (`{{ref}}` tags) — never shown to the analyst as is. */
  formula: string;
  /** Every field this formula may name: own fields first, then the joined Data Marts'. */
  index: readonly ReferenceableField[];
  /** The aggregate functions this warehouse's dialect offers, for autocomplete and the save gate. */
  functionNames: readonly string[];
  /**
   * The scalar functions to suggest for this warehouse. Autocomplete ONLY — deliberately not part
   * of the save gate: `findUnresolvedIdentifiers` already lets any name followed by `(` through as
   * a call, so feeding it this curated, incomplete list would gain nothing and risk turning it
   * into the authority its own module forbids it to be.
   */
  scalarFunctionNames?: readonly string[];
  /**
   * Whether the joined Data Marts behind `index` are actually known. Only 'ready' justifies telling
   * the analyst a dotted name is not a field of this Data Mart.
   */
  joinedFieldsStatus: JoinedFieldsStatus;
  /**
   * Persists the edited formula, in STORED form. Omit for a read-only table: the cell then renders
   * the formula as plain text rather than an editor whose Apply would have nowhere to go.
   */
  onSave?: (formula: string) => void;
  /**
   * The Data Mart being edited, plus the metric's own name and output type — everything the live
   * backend check needs to ask about THIS field. Omit any of them (a table with no Data Mart in
   * context, a metric with no name yet) and the editor runs the local name check alone, which is
   * the only check that gates Apply anyway.
   */
  dataMartId?: string;
  fieldName?: string;
  fieldType?: string;
}

/**
 * The editor as it appears inside the open popover, with the live backend check attached.
 *
 * A component rather than inline JSX so the check's lifetime is the POPOVER's: it mounts when the
 * analyst opens the editor and unmounts when they close it, which is what cancels an in-flight
 * request and stops the timer without the cell having to track whether the popover is open.
 */
function LiveCheckedFormulaEditor({
  value,
  references,
  dataMartId,
  fieldName,
  fieldType,
  ...editorProps
}: FormulaEditorProps & { dataMartId?: string; fieldName?: string; fieldType?: string }) {
  // The endpoint takes the STORED form, the same shape the save carries. A reference carrying a
  // double quote cannot be spelled as a tag at all (formula-authoring.ts) — that is the local
  // gate's refusal to explain on Apply, so the live check simply has nothing to ask about.
  const formula = useMemo(() => {
    try {
      return toStoredForm(value, references);
    } catch {
      return '';
    }
  }, [value, references]);

  // Straight from the context rather than through the cell's props, unlike the three values beside
  // it: the path from the schema page to here runs through SchemaContent, five per-storage tables
  // and BaseSchemaTable, and this is the only component that has any use for what the OTHER rows
  // hold.
  const calculatedFields = useDraftCalculatedFields();

  const diagnostics = useFormulaDiagnostics({
    dataMartId: dataMartId ?? '',
    name: fieldName ?? '',
    type: fieldType ?? '',
    formula,
    calculatedFields,
  });

  return (
    <FormulaEditor
      {...editorProps}
      value={value}
      references={references}
      diagnostics={diagnostics}
    />
  );
}

/**
 * Plain text on the row's own background, clamped to two lines.
 *
 * NOT on a surface of its own: a filled one was tried and rejected. It began under the `Mode`
 * header and ran under `PK` and the aggregations, so a solid rectangle sat beneath three headers
 * that say nothing about a calculated field and read as a value FOR them. Where the formula stops
 * is said by a rule at the band's edge instead (`SchemaTable.tsx`), which is a mark a table already
 * means as a column boundary.
 *
 * It used to wrap, and a formula authored over several lines made its row several lines tall — a
 * calculated field pushed the whole table around in a way no ordinary field does.
 *
 * `whitespace-normal` overrides the `white-space: pre` the cell sets inline, folding the author's
 * own newlines and indentation into single spaces; `line-clamp-2` then keeps two lines of the
 * result. Nothing here rewrites the text, so the reference spans still line up with it, and the
 * whole formula is a hover away.
 *
 * TWO lines because they are free: the row's height comes from the controls beside the formula,
 * measured at 49px whether the formula occupies one 16px line or two. The third line is what
 * costs — it takes the row to 64px.
 *
 * Clamped rather than `whitespace-nowrap`, which also bounds the height but makes the formula
 * unbreakable: measured on this table's own widths, that grew the formula column from 549px to
 * 1042px at the other columns' expense. Wrapped text keeps the intrinsic width it always had.
 */
const PREVIEW_CLASSES =
  'line-clamp-2 max-w-full font-mono text-xs break-words whitespace-normal ' +
  'text-gray-600 dark:text-gray-300';

/** The same formula in the hover card, where the author's own line breaks are worth keeping. */
const CARD_CLASSES = 'font-mono text-xs break-words whitespace-pre-wrap text-foreground';

/**
 * The whole formula, for a row that now shows only its first line.
 *
 * Suppressed while the editor is open: the editor's popover is anchored to this same cell, and two
 * floating layers over one row is one too many. `open` is therefore controlled rather than left to
 * the primitive, which has no way to know about the other popover — and lowered explicitly on the
 * way in, because Radix drops a close whose value already matches the prop, which would leave a
 * stale `open` to spring back the moment suppression lifts.
 *
 * `openOnFocus` belongs to the READ-ONLY row, which has no editor to open and would otherwise be
 * unreachable without a pointer. The editable row refuses it: the editor's popover returns focus
 * to this very trigger when it closes, and Radix opens on ANY focus, so every Apply would be
 * followed by a card appearing over the rows below with nothing to explain it. A keyboard reader
 * there opens the editor itself, which shows more than the card does.
 *
 * The wrapper renders even for an empty formula — with nothing to show and nothing to open. It
 * used to return `children` bare, and applying the FIRST formula of a new field then swapped one
 * element type for another at the same position: React unmounted the editor before its close could
 * be reported, and the cell stayed suppressed for good.
 */
function FormulaHoverCard({
  text,
  references,
  describeReference,
  suppressed,
  openOnFocus,
  children,
}: {
  text: string;
  references: readonly ResolvedReference[];
  describeReference: (reference: ResolvedReference) => string | undefined;
  suppressed: boolean;
  openOnFocus: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (suppressed) setOpen(false);
  }, [suppressed]);
  const empty = text.trim() === '';
  return (
    <HoverCard
      open={open && !suppressed && !empty}
      onOpenChange={setOpen}
      openDelay={300}
      closeDelay={100}
    >
      <HoverCardTrigger
        asChild
        // Radix composes this with its own opener and skips that opener once the event is
        // defaulted-prevented, which is the whole mechanism behind `openOnFocus`.
        onFocus={
          openOnFocus
            ? undefined
            : event => {
                event.preventDefault();
              }
        }
      >
        {children}
      </HoverCardTrigger>
      {/* Matches the editor popover's own width, so hovering and editing show the formula
          wrapped at the same measure. */}
      <HoverCardContent align='start' className='px-4 py-3 sm:w-[520px] sm:max-w-[520px]'>
        <div className={CARD_CLASSES}>
          <FormulaChips text={text} references={references} describeReference={describeReference} />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

const CALCULATED_FIELDS_DOCS =
  'https://docs.owox.com/docs/getting-started/setup-guide/calculated-fields/' +
  '?utm_source=owox_data_marts&utm_medium=dm_page_data_setup_tab&utm_campaign=calculated_field_formula_editor';

/**
 * The formula of a calculated field, shown and edited in its own row.
 *
 * Edited through the same popover an ordinary field's Description uses (`EditableText`), with the
 * Monaco `FormulaEditor` in place of its textarea — so the formula is authored where it lives,
 * with no modal in the way.
 *
 * The analyst only ever sees the AUTHORING form (plain field names); the stored `{{ref}}` form is
 * produced on Apply and is the only thing that leaves this component.
 */
export function CalculatedFieldFormulaCell({
  formula,
  index,
  functionNames,
  scalarFunctionNames,
  joinedFieldsStatus,
  onSave,
  dataMartId,
  fieldName,
  fieldType,
}: CalculatedFieldFormulaCellProps) {
  const authoring = useMemo(() => toAuthoringForm(formula, refDisplayName), [formula]);
  // The row's pills answer the same questions the editor's do: `orders` is a join alias, and
  // `revenue` may be another formula — neither is knowable from the pill's own text, and both are
  // in the index.
  const sourceLabels = useMemo(() => buildSourceLabelIndex(index), [index]);
  const calculatedFields = useMemo(() => buildCalculatedFieldIndex(index), [index]);
  const describeReference = useMemo(
    () => (reference: ResolvedReference) =>
      describeReferenceSource(reference, sourceLabels, calculatedFields),
    [sourceLabels, calculatedFields]
  );
  /**
   * The references resolved for the buffer currently in the popover, or null while it still holds
   * the stored formula's own authoring text. Reset when the popover opens (`onEditStart`), so a
   * cancelled edit can never leave spans behind that point into text no longer on screen.
   */
  const [draftRefs, setDraftRefs] = useState<ResolvedReference[] | null>(null);
  const refs = draftRefs ?? authoring.refs;
  /** Whether the editor popover is open, so the hover card can stand down while it is. */
  const [isEditing, setIsEditing] = useState(false);

  if (!onSave) {
    return (
      <FormulaHoverCard
        text={authoring.text}
        references={authoring.refs}
        describeReference={describeReference}
        suppressed={false}
        openOnFocus
      >
        {/* Focusable so the card is reachable without a pointer: this read-only row has no editor
            behind it, so nothing else here takes focus. The clamp is visual only — the whole
            formula is in the DOM either way, which is what a screen reader reads. */}
        <span tabIndex={0} className={`w-full ${PREVIEW_CLASSES}`}>
          <FormulaChips
            text={authoring.text}
            references={authoring.refs}
            describeReference={describeReference}
          />
        </span>
      </FormulaHoverCard>
    );
  }

  // Refuses on the two grounds the backend cannot answer for us: a name the editor never resolved
  // would travel as bare SQL (see formula-unresolved-identifiers.ts), and toStoredForm throws on a
  // reference whose field or path carries a double quote (formula-authoring.ts).
  const applyFormula = (text: string): string | null => {
    if (text.trim() === '') return 'A calculated field needs a formula.';
    const unresolved = describeUnresolvedIdentifiers(
      findUnresolvedIdentifiers(text, refs, { functionNames }),
      joinedFieldsStatus
    );
    if (unresolved) return unresolved;
    try {
      onSave(toStoredForm(text, refs));
    } catch (e) {
      return e instanceof Error ? e.message : 'This formula could not be saved.';
    }
    return null;
  };

  return (
    <FormulaHoverCard
      text={authoring.text}
      references={authoring.refs}
      describeReference={describeReference}
      suppressed={isEditing}
      openOnFocus={false}
    >
      <div>
        <EditableText
          value={authoring.text}
          placeholder='Formula is required'
          className={PREVIEW_CLASSES}
          // The name of the row being edited, which the open popover covers up. Not "Formula" when a
          // name is known — the hint below already says what this editor is.
          editorTitle={fieldName?.trim() ? fieldName : 'Formula'}
          editorHint={
            <>
              Warehouse SQL over this Data Mart&apos;s fields.{' '}
              <ExternalAnchor href={CALCULATED_FIELDS_DOCS}>Learn more</ExternalAnchor>
            </>
          }
          // The row shows the PERSISTED formula, so it draws the stored tags' own spans — never
          // `refs`, which follow the popover's draft and would not line up with this text.
          renderValue={text => (
            <FormulaChips
              text={text}
              references={authoring.refs}
              describeReference={describeReference}
            />
          )}
          onEditStart={() => {
            setIsEditing(true);
            setDraftRefs(null);
          }}
          onEditEnd={() => {
            setIsEditing(false);
          }}
          onApply={applyFormula}
          renderEditor={ctx => (
            <div className='w-[520px]'>
              <LiveCheckedFormulaEditor
                value={ctx.value}
                references={refs}
                index={index}
                functionNames={functionNames}
                scalarFunctionNames={scalarFunctionNames}
                ariaLabel='Formula'
                dataMartId={dataMartId}
                fieldName={fieldName}
                fieldType={fieldType}
                onChange={next => {
                  setDraftRefs(next.refs);
                  ctx.setValue(next.text);
                }}
                // `EditableText` binds Enter and Ctrl+Enter to the textarea this editor replaces, so
                // on this path they reach nothing. Same action as the Apply button, refusal included.
                onSubmit={ctx.apply}
              />
            </div>
          )}
        />
      </div>
    </FormulaHoverCard>
  );
}
