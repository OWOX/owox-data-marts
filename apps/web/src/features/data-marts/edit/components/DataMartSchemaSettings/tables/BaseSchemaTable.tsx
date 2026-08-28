import { cn } from '@owox/ui/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ColumnDef, Row, Table } from '@tanstack/react-table';
import { EyeOff, Sigma } from 'lucide-react';
import type { ComponentType } from 'react';
import { useCallback, useMemo } from 'react';
import type { SortingStrategy } from '@dnd-kit/sortable';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types';
import { EditableText } from '@owox/ui/components/common/editable-text';
import {
  SchemaFieldActionsButton,
  SchemaFieldCalculatedIcon,
  SchemaFieldPrimaryKeyCheckbox,
  SchemaFieldStatusIcon,
  SchemaHeaderAiButton,
  TableActionsButton,
  type SchemaCapableStorageType,
} from '../components';
import { asString } from '../utils';
import { SchemaTable, type RowCellSpan } from './SchemaTable';
import type { SchemaAiHelper } from '../types/ai-helper';
import { renderFieldAliasAi, renderFieldDescriptionAi } from '../utils/render-field-ai';
import { AllowedAggregationsSelect } from '../AllowedAggregationsSelect';
import { resolveFieldGovernance } from '../../../../shared/utils/aggregation-governance';
import { isRowLevelCalculatedField } from '../../../../shared/utils/calculated-field-level';
import type { SchemaToolbar } from '../types/schema-toolbar';
import { CalculatedFieldFormulaCell } from '../calculated/CalculatedFieldFormulaCell';
import { aggregateFunctionsFor } from '../calculated/formula-function-dialects';
import { scalarFunctionsFor } from '../calculated/formula-scalar-functions';
import {
  buildJoinedReferenceIndex,
  buildReferenceIndex,
  type SchemaField,
} from '../calculated/formula-reference-index';
import { useJoinedFormulaFields } from '../calculated/joined-fields-context';
import { useFormulaDataMartId } from '../calculated/formula-data-mart-context';
import { useCalculatedFieldIssues } from '../calculated/calculated-field-issues-context';

// Extended column definition with optional columnIndex property
export type ExtendedColumnDef<T extends BaseSchemaField> = ColumnDef<T> & {
  columnIndex?: number;
};

// Import the Props type from @dnd-kit/sortable for SortableContext
import type { Props as SortableContextProps } from '@dnd-kit/sortable/dist/components/SortableContext';

// Type for the drag context props (used with SortableContext from @dnd-kit/sortable)
export interface DragContextProps {
  items: (string | number)[];
  strategy: SortingStrategy;
  // Children is provided by the component that uses DragContext, not in the dragContextProps object
  children?: React.ReactNode;
}

// Type for the row component props (compatible with both SortableTableRow and TableRow)
export interface RowComponentProps<T = unknown> {
  id: string | number;
  row?: T;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for the BaseSchemaTable component
 */
export interface BaseSchemaTableProps<T extends BaseSchemaField> {
  /** The fields to display in the table */
  fields: T[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: T[]) => void;
  /** Custom onAddRow handler to override default behavior */
  onAddRow?: () => void;
  /** Function to create a new field */
  createNewField: () => T;
  /** Function to render the type column cell */
  renderTypeCell: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Additional columns to add to the table */
  additionalColumns?: ExtendedColumnDef<T>[];
  /** Fields to use for status counting (defaults to fields) */
  fieldsForStatusCount?: T[];
  /** Callback function to call when the search value changes */
  onSearchChange?: (searchValue: string) => void;
  /** Custom header for the name column */
  nameColumnHeader?: () => React.ReactNode;
  /** Custom cell for the name column */
  nameColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the primary key column */
  primaryKeyColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the alias column */
  aliasColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the description column */
  descriptionColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the actions column */
  actionsColumnCell?: (props: { row: Row<T>; table: Table<T> }) => React.ReactNode;
  /** Drag-and-drop context component */
  dragContext: ComponentType<SortableContextProps>;
  /** Props for the drag-and-drop context */
  dragContextProps: DragContextProps;
  /** Custom row component for drag-and-drop */
  rowComponent?: ComponentType<RowComponentProps<Row<T>>>;
  /** Function to get the ID for a row */
  getRowId?: (row: Row<T>) => string | number;
  /** AI helper handlers passed to per-field actions menu. Omit to hide AI options. */
  aiHelper?: SchemaAiHelper;
  /** Schema toolbar component */
  schemaToolbar: SchemaToolbar;
  /** The storage type — picks the dialect whose aggregates a formula may name. */
  storageType: SchemaCapableStorageType;
  /**
   * The Data Mart's genuine (non-flattened) schema field tree, for the calculated field's
   * formula autocomplete. Defaults to `fields` — correct for every storage except BigQuery, whose
   * `fields` prop here is already flattened for row rendering (see useRecordExpansion), which
   * would both mis-shape nested paths and duplicate entries if fed to buildReferenceIndex as is.
   */
  schemaFields?: readonly SchemaField[];
  /**
   * Adds or updates a calculated field. `index` is undefined for a new metric (appended);
   * otherwise the FLATTENED row index of the metric being edited. Defaults to operating directly
   * on `fields`/`onFieldsChange` — correct for every storage except BigQuery, which overrides this
   * to route through its flattened-index → nested-path translation (useNestedFieldOperations),
   * since `fields`/`onFieldsChange` here are the flattened view, not the true schema tree.
   */
  onSaveCalculatedField?: (index: number | undefined, next: SchemaField) => void;
}

/** The id TanStack derives for a column definition: its explicit `id`, else its accessor key. */
function columnIdOf<T extends BaseSchemaField>(column: ColumnDef<T>): string | undefined {
  if (column.id) return column.id;
  return 'accessorKey' in column ? String(column.accessorKey) : undefined;
}

/**
 * Base component for schema tables
 * Provides common functionality for both BigQuery and Athena schema tables
 */
export function BaseSchemaTable<T extends BaseSchemaField>({
  fields,
  onFieldsChange,
  onAddRow,
  createNewField,
  renderTypeCell,
  additionalColumns = [],
  fieldsForStatusCount,
  onSearchChange,
  nameColumnHeader,
  nameColumnCell,
  primaryKeyColumnCell,
  aliasColumnCell,
  descriptionColumnCell,
  actionsColumnCell,
  dragContext,
  dragContextProps,
  rowComponent,
  getRowId,
  aiHelper,
  schemaToolbar,
  storageType,
  schemaFields,
  onSaveCalculatedField,
}: BaseSchemaTableProps<T>) {
  // Handler to update a field
  const updateField = useCallback(
    (index: number, updatedField: Partial<T>) => {
      if (onFieldsChange) {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], ...updatedField };
        onFieldsChange(newFields);
      }
    },
    [fields, onFieldsChange]
  );

  // Handler to add a new row
  const handleAddRow = useCallback(() => {
    if (onFieldsChange) {
      const newField = createNewField();
      onFieldsChange([...fields, newField]);
    }
  }, [fields, onFieldsChange, createNewField]);

  const joinedFormulaFields = useJoinedFormulaFields();
  const calculatedFieldIssues = useCalculatedFieldIssues();
  const formulaDataMartId = useFormulaDataMartId();

  const defaultSaveCalculatedField = useCallback(
    (index: number | undefined, next: SchemaField) => {
      if (!onFieldsChange) return;
      if (index === undefined) {
        onFieldsChange([...fields, { ...createNewField(), ...next } as T]);
      } else {
        updateField(index, next as Partial<T>);
      }
    },
    [onFieldsChange, fields, createNewField, updateField]
  );
  const saveCalculatedField = onSaveCalculatedField ?? defaultSaveCalculatedField;

  // A new metric is appended straight away and filled in on its row — the same way "Add Field"
  // works. Its status is CONNECTED because there is no warehouse column to be disconnected from.
  const handleAddCalculatedField = useCallback(() => {
    saveCalculatedField(undefined, {
      ...createNewField(),
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.CONNECTED,
      calculated: { formula: '' },
    });
  }, [saveCalculatedField, createNewField]);

  // Own fields first: only the MENU order is decided here — which candidate a typed name resolves
  // to is `resolveTypedName`'s precedence rule, not this concatenation's order.
  const referenceIndex = useMemo(
    () => [
      ...buildReferenceIndex(schemaFields ?? fields),
      ...buildJoinedReferenceIndex(joinedFormulaFields.fields),
    ],
    [schemaFields, fields, joinedFormulaFields.fields]
  );
  // The aggregate functions THIS warehouse's dialect offers, as the backend parser recognizes
  // them — offering any other name would suggest a formula the save is guaranteed to reject.
  const functionNames = useMemo(() => aggregateFunctionsFor(storageType), [storageType]);
  // The scalar functions to SUGGEST alongside them — a curated, deliberately incomplete list that
  // judges nothing (see formula-scalar-functions.ts), so unlike `functionNames` it never reaches
  // the save gate. An unrecognised storage gets none rather than a guessed dialect.
  const scalarFunctionNames = useMemo(() => scalarFunctionsFor(storageType), [storageType]);

  const renderFormulaCell = useCallback(
    (row: Row<T>) => (
      <CalculatedFieldFormulaCell
        formula={row.original.calculated?.formula ?? ''}
        index={referenceIndex}
        functionNames={functionNames}
        scalarFunctionNames={scalarFunctionNames}
        joinedFieldsStatus={joinedFormulaFields.status}
        dataMartId={formulaDataMartId}
        fieldName={row.original.name}
        fieldType={row.original.type}
        // Read-only (no onFieldsChange): both save paths bail without it, so an editor here would
        // let an analyst edit and press Apply only to watch the change vanish.
        onSave={
          onFieldsChange
            ? formula => {
                saveCalculatedField(row.index, {
                  ...(row.original as SchemaField),
                  // `calculated` is replaced wholesale, so `warehouseValidation` goes: a stamp
                  // must not outlive the formula it judged.
                  //
                  // The LEVEL is carried instead. It decides this row's shape, and an absent one
                  // reads as aggregate — which took the "Σ available" control off a dimension the
                  // moment its formula was touched, and put it back only after a save. Safe to
                  // keep, because the save overwrites `calculated.level` from its own analysis
                  // (CalculatedFieldValidatorService) rather than trusting what it was sent.
                  calculated: { formula, level: row.original.calculated?.level },
                });
              }
            : undefined
        }
      />
    ),
    [
      referenceIndex,
      functionNames,
      scalarFunctionNames,
      joinedFormulaFields.status,
      formulaDataMartId,
      onFieldsChange,
      saveCalculatedField,
    ]
  );

  // Handler to delete a row
  const handleDeleteRow = useCallback(
    (index: number) => {
      if (onFieldsChange) {
        const newFields = [...fields];
        newFields.splice(index, 1);
        onFieldsChange(newFields);
      }
    },
    [fields, onFieldsChange]
  );

  // Define common columns
  const baseColumns = useMemo<ColumnDef<T>[]>(
    () => [
      {
        id: 'dragHandle',
        header: '',
        size: 24,
        enableHiding: false,
      },
      {
        accessorKey: 'status',
        header: '',
        size: 36,
        cell: ({ row }) =>
          row.original.calculated ? (
            <SchemaFieldCalculatedIcon
              missingReferences={calculatedFieldIssues.get(row.original.name)}
            />
          ) : (
            <SchemaFieldStatusIcon status={row.getValue('status')} />
          ),
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header:
          nameColumnHeader ??
          (() => (
            <Tooltip>
              <TooltipTrigger className='cursor-default'>Name</TooltipTrigger>
              <TooltipContent>Field name in the output schema</TooltipContent>
            </Tooltip>
          )),
        size: 80,
        cell: ({ row }) => {
          if (nameColumnCell) {
            return nameColumnCell({ row, updateField });
          }
          return (
            <EditableText
              value={asString(row.getValue('name'))}
              onValueChange={value => {
                updateField(row.index, { name: value } as Partial<T>);
              }}
              placeholder={'Field name is required'}
              isBold={true}
              trailingContent={
                row.original.isHiddenForReporting ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <EyeOff className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                    </TooltipTrigger>
                    <TooltipContent>Hidden from reports</TooltipContent>
                  </Tooltip>
                ) : undefined
              }
            />
          );
        },
        enableHiding: false,
      },
      // Type column is provided by the specific implementation
      {
        accessorKey: 'isPrimaryKey',
        header: () => (
          <Tooltip>
            <TooltipTrigger className='cursor-default'>PK</TooltipTrigger>
            <TooltipContent>
              Is field must be considered as a part of the output Primary Key
            </TooltipContent>
          </Tooltip>
        ),
        size: 36,
        cell: ({ row }) => {
          // True at BOTH levels, and not about aggregation: no calculated field owns a warehouse
          // column, so none can be part of the output Primary Key. The save refuses it too
          // (`DataMartSchemaParserFacade`); hiding it here keeps the analyst off a dead end.
          if (row.original.calculated) return null;
          if (primaryKeyColumnCell) {
            return primaryKeyColumnCell({ row, updateField });
          }
          return (
            <SchemaFieldPrimaryKeyCheckbox
              isPrimaryKey={row.getValue('isPrimaryKey')}
              onPrimaryKeyChange={value => {
                updateField(row.index, { isPrimaryKey: value } as Partial<T>);
              }}
            />
          );
        },
        enableHiding: false,
      },
      {
        id: 'allowedAggregations',
        header: () => (
          <Tooltip>
            <TooltipTrigger
              className='flex cursor-default items-center gap-1'
              aria-label='Available aggregations'
            >
              <Sigma className='h-3.5 w-3.5' />
              available
            </TooltipTrigger>
            <TooltipContent>
              Available aggregations — functions a report may apply to this field. Defaults by type;
              clear all to disallow aggregating it.
            </TooltipContent>
          </Tooltip>
        ),
        size: 120,
        cell: ({ row }) => {
          // An AGGREGATE-level field already IS an aggregate and can never be aggregated again; a
          // row-level one is a dimension a report may aggregate, so it governs its own set here
          // exactly like a warehouse column. Relaxing this line ALONE changes nothing visible —
          // the formula band below replaces this cell before the guard runs — which is why the
          // band has to end before this column for a row-level row.
          if (row.original.calculated && !isRowLevelCalculatedField(row.original.calculated)) {
            return null;
          }
          return (
            <AllowedAggregationsSelect
              value={
                row.original.allowedAggregations ??
                resolveFieldGovernance(row.original.type).allowedAggregations
              }
              fieldType={row.original.type}
              onChange={next => {
                updateField(row.index, { allowedAggregations: next } as Partial<T>);
              }}
              ariaLabel={`Aggregations for ${asString(row.getValue('name'))}`}
            />
          );
        },
      },
      {
        accessorKey: 'alias',
        header: () => (
          <div className='group flex items-center gap-1'>
            <Tooltip>
              <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>

              <TooltipContent>Alternative name for the field</TooltipContent>
            </Tooltip>
            {schemaToolbar.showAiHelper && (
              <div
                className={cn(
                  'opacity-0 transition-opacity group-hover:opacity-100',
                  schemaToolbar.ai.loading.aliases && 'opacity-100'
                )}
              >
                <SchemaHeaderAiButton
                  tooltip='Generate aliases for all fields'
                  ariaLabel='Generate field aliases'
                  disabled={schemaToolbar.ai.disabled}
                  isLoading={schemaToolbar.ai.loading.aliases}
                  onClick={schemaToolbar.ai.onGenerateAliases}
                />
              </div>
            )}
          </div>
        ),
        size: 80,
        cell: ({ row }) => {
          if (aliasColumnCell) {
            return aliasColumnCell({ row, updateField });
          }
          const fname = fields[row.index]?.name;
          return (
            <EditableText
              value={row.getValue('alias')}
              onValueChange={value => {
                updateField(row.index, { alias: value } as Partial<T>);
              }}
              placeholder='-'
              editorAction={renderFieldAliasAi(aiHelper, fname)}
            />
          );
        },
      },
      {
        accessorKey: 'description',
        header: () => (
          <div className='group flex items-center gap-1'>
            <Tooltip>
              <TooltipTrigger className='cursor-default'>Description</TooltipTrigger>

              <TooltipContent>Detailed information about the field</TooltipContent>
            </Tooltip>
            {schemaToolbar.showAiHelper && (
              <div
                className={cn(
                  'opacity-0 transition-opacity group-hover:opacity-100',
                  schemaToolbar.ai.loading.descriptions && 'opacity-100'
                )}
              >
                <SchemaHeaderAiButton
                  tooltip='Generate descriptions for all fields'
                  ariaLabel='Generate field descriptions'
                  disabled={schemaToolbar.ai.disabled}
                  isLoading={schemaToolbar.ai.loading.descriptions}
                  onClick={schemaToolbar.ai.onGenerateDescriptions}
                />
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          if (descriptionColumnCell) {
            return descriptionColumnCell({ row, updateField });
          }
          const fname = fields[row.index]?.name;
          return (
            <EditableText
              value={row.getValue('description')}
              onValueChange={value => {
                updateField(row.index, { description: value } as Partial<T>);
              }}
              minRows={5}
              placeholder='-'
              editorAction={renderFieldDescriptionAi(aiHelper, fname)}
            />
          );
        },
      },
      {
        id: 'actions',
        header: ({ table }) => <TableActionsButton table={table} />,
        cell: ({ row, table }) => {
          if (actionsColumnCell) {
            return actionsColumnCell({ row, table });
          }
          return (
            <SchemaFieldActionsButton
              row={row}
              onDeleteRow={onFieldsChange ? handleDeleteRow : undefined}
              isHiddenForReporting={!!row.original.isHiddenForReporting}
              onToggleHiddenForReporting={
                onFieldsChange
                  ? (index: number) => {
                      updateField(index, {
                        isHiddenForReporting: !fields[index].isHiddenForReporting,
                      } as Partial<T>);
                    }
                  : undefined
              }
            />
          );
        },
        size: 40,
        enableResizing: false,
        enableHiding: false,
      },
    ],
    [
      fields,
      updateField,
      handleDeleteRow,
      onFieldsChange,
      calculatedFieldIssues,
      nameColumnHeader,
      nameColumnCell,
      primaryKeyColumnCell,
      aliasColumnCell,
      descriptionColumnCell,
      actionsColumnCell,
      aiHelper,
      schemaToolbar.showAiHelper,
      schemaToolbar.ai.disabled,
      schemaToolbar.ai.loading.aliases,
      schemaToolbar.ai.loading.descriptions,
      schemaToolbar.ai.onGenerateAliases,
      schemaToolbar.ai.onGenerateDescriptions,
    ]
  );

  // Combine base columns with type column and any additional columns
  const { columns, formulaSpan } = useMemo(() => {
    const typeColumnIndex = 3; // Insert type column after name column
    const typeColumn: ColumnDef<T> = {
      accessorKey: 'type',
      header: () => (
        <Tooltip>
          <TooltipTrigger className='cursor-default pl-[12px]'>Type</TooltipTrigger>
          <TooltipContent>Data type of the field</TooltipContent>
        </Tooltip>
      ),
      size: 80,
      cell: props => renderTypeCell({ row: props.row, updateField }),
      enableHiding: false,
    };

    const result = [...baseColumns];
    result.splice(typeColumnIndex, 0, typeColumn);

    if (additionalColumns.length > 0) {
      const columnsToAdd = [...additionalColumns];

      columnsToAdd.sort((a, b) => {
        const indexA = a.columnIndex ?? Infinity;
        const indexB = b.columnIndex ?? Infinity;
        return indexA - indexB;
      });

      columnsToAdd.forEach(column => {
        if (column.columnIndex !== undefined) {
          const insertIndex = Math.min(Math.max(0, column.columnIndex), result.length);
          result.splice(insertIndex, 0, column as ColumnDef<T>);
        } else {
          result.splice(result.length - 1, 0, column as ColumnDef<T>);
        }
      });
    }

    // The formula takes the band between Type and "Σ available": every column in it describes
    // something a calculated field does not have (BigQuery's Mode, the primary key, and — for an
    // aggregate-level field — an aggregation to apply), and each already renders nothing for such
    // a row. Every column in the band can host the formula, so hiding one moves the cell along
    // instead of taking the formula off the row with it.
    //
    // A ROW-LEVEL field's band stops one column short: "Σ available" is a control it owns, so the
    // formula must not cover it.
    const typeIndex = result.findIndex(column => columnIdOf(column) === 'type');
    const lastIndex = result.findIndex(column => columnIdOf(column) === 'allowedAggregations');
    const band: string[] = [];
    const rowLevelBand: string[] = [];
    const bandForRow = (row: Row<T>): readonly string[] => {
      if (!row.original.calculated) return [];
      return isRowLevelCalculatedField(row.original.calculated) ? rowLevelBand : band;
    };
    if (typeIndex !== -1 && lastIndex > typeIndex) {
      for (let index = typeIndex + 1; index <= lastIndex; index++) {
        const column = result[index];
        const columnId = columnIdOf(column);
        if (!columnId) continue;
        band.push(columnId);
        if (index !== lastIndex) rowLevelBand.push(columnId);
        const ownCell = column.cell;
        result[index] = {
          ...column,
          cell: props => {
            // Only the band's HOST cell is ever asked (SchemaTable renders none of the covered
            // ones), so answering for any member is enough — and a row whose band excludes this
            // column falls through to the real cell instead of drawing the formula twice.
            if (bandForRow(props.row).includes(columnId)) return renderFormulaCell(props.row);
            return typeof ownCell === 'function' ? (ownCell(props) as React.ReactNode) : null;
          },
        } as ColumnDef<T>;
      }
    }

    return {
      columns: result,
      formulaSpan: band.length > 0 ? ({ bandFor: bandForRow } satisfies RowCellSpan<T>) : undefined,
    };
  }, [baseColumns, renderTypeCell, updateField, additionalColumns, renderFormulaCell]);

  return (
    <SchemaTable
      fields={fields}
      columns={columns}
      rowCellSpan={formulaSpan}
      onFieldsChange={onFieldsChange}
      onAddRow={onAddRow ?? (onFieldsChange ? handleAddRow : undefined)}
      onAddCalculatedField={onFieldsChange ? handleAddCalculatedField : undefined}
      fieldsForStatusCount={fieldsForStatusCount}
      onSearchChange={onSearchChange}
      dragContext={dragContext}
      dragContextProps={dragContextProps}
      rowComponent={rowComponent}
      getRowId={getRowId}
      schemaToolbar={schemaToolbar}
    />
  );
}
