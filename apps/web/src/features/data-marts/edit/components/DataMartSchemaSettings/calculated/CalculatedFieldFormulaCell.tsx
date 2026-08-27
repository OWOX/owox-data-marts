import { useMemo, useState } from 'react';
import { EditableText } from '@owox/ui/components/common/editable-text';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
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
 * Plain text on the row's own background, wrapping rather than truncating.
 *
 * NOT on a surface of its own: a filled one was tried and rejected. It began under the `Mode`
 * header and ran under `PK` and the aggregations, so a solid rectangle sat beneath three headers
 * that say nothing about a calculated field and read as a value FOR them. Where the formula stops
 * is said by a rule at the band's edge instead (`SchemaTable.tsx`), which is a mark a table already
 * means as a column boundary.
 *
 * `whitespace-pre-wrap` overrides the `white-space: pre` the table cell sets inline — without it a
 * long formula is one unbroken line and the wrap never happens. `break-words` covers the case that
 * has no space to break at: one very long identifier.
 */
const PREVIEW_CLASSES =
  'max-w-full font-mono text-xs break-words whitespace-pre-wrap text-gray-600 dark:text-gray-300';

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

  if (!onSave) {
    return (
      <span className={`block w-full ${PREVIEW_CLASSES}`} title={authoring.text}>
        <FormulaChips
          text={authoring.text}
          references={authoring.refs}
          describeReference={describeReference}
        />
      </span>
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
    <div title={authoring.text}>
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
          setDraftRefs(null);
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
  );
}
