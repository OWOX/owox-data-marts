import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useCallback } from 'react';
import type { BigQuerySchemaField } from '../../../../shared/types/data-mart-schema.types.ts';
import {
  BigQueryFieldType,
  BigQueryFieldMode,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types.ts';
import { ActionsDropdown } from './ActionsDropdown';
import { asOptionalString, asString } from './schema-utils.ts';
import { SchemaFieldModeSelect } from './SchemaFieldModeSelect';
import { SchemaFieldPrimaryKeyCheckbox } from './SchemaFieldPrimaryKeyCheckbox';
import { SchemaFieldStatusIcon } from './SchemaFieldStatusIcon';
import { SchemaFieldTypeSelect } from './SchemaFieldTypeSelect';
import { SchemaFieldEditableText } from './SchemaFieldEditableText';
import { SchemaTable } from './SchemaTable';

interface BigQuerySchemaTableProps {
  fields: BigQuerySchemaField[];
  onFieldsChange?: (fields: BigQuerySchemaField[]) => void;
}

export function BigQuerySchemaTable({ fields, onFieldsChange }: BigQuerySchemaTableProps) {
  // Handler to update a field
  const updateField = useCallback(
    (index: number, updatedField: Partial<BigQuerySchemaField>) => {
      if (onFieldsChange) {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], ...updatedField };
        onFieldsChange(newFields);
      }
    },
    [fields, onFieldsChange]
  );

  // Handler to add a new row
  const handleAddRow = () => {
    if (onFieldsChange) {
      const newField: BigQuerySchemaField = {
        name: '',
        type: BigQueryFieldType.STRING,
        mode: BigQueryFieldMode.NULLABLE,
        isPrimaryKey: false,
        status: DataMartSchemaFieldStatus.DISCONNECTED,
      };
      onFieldsChange([...fields, newField]);
    }
  };

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

  const columns = useMemo<ColumnDef<BigQuerySchemaField>[]>(
    () => [
      {
        accessorKey: 'status',
        header: '',
        cell: ({ row }) => <SchemaFieldStatusIcon status={row.getValue('status')} />,
        maxSize: 24,
        size: 24,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <SchemaFieldEditableText
            value={asString(row.getValue('name'))}
            onValueChange={value => {
              updateField(row.index, { name: value });
            }}
          />
        ),
        enableHiding: false,
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => (
          <SchemaFieldTypeSelect
            type={row.getValue('type')}
            storageType='bigquery'
            onTypeChange={value => {
              updateField(row.index, { type: value as BigQueryFieldType });
            }}
          />
        ),
        enableHiding: false,
      },
      {
        accessorKey: 'isPrimaryKey',
        header: 'PK',
        maxSize: 24,
        size: 24,
        cell: ({ row }) => (
          <SchemaFieldPrimaryKeyCheckbox
            isPrimaryKey={row.getValue('isPrimaryKey')}
            onPrimaryKeyChange={value => {
              updateField(row.index, { isPrimaryKey: value });
            }}
          />
        ),
        enableHiding: false, // Cannot be hidden
      },
      {
        accessorKey: 'alias',
        header: 'Alias',
        cell: ({ row }) => (
          <SchemaFieldEditableText
            value={asOptionalString(row.getValue('alias'))}
            onValueChange={value => {
              updateField(row.index, { alias: value });
            }}
          />
        ),
      },
      {
        accessorKey: 'mode',
        header: 'Mode',
        cell: ({ row }) => (
          <SchemaFieldModeSelect
            mode={row.getValue('mode')}
            onModeChange={value => {
              updateField(row.index, { mode: value });
            }}
          />
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <SchemaFieldEditableText
            value={asOptionalString(row.getValue('description'))}
            onValueChange={value => {
              updateField(row.index, { description: value });
            }}
          />
        ),
      },
      {
        id: 'actions',
        header: ({ table }) => <ActionsDropdown table={table} />,
        cell: ({ row, table }) => (
          <ActionsDropdown
            table={table}
            row={row}
            onDeleteRow={onFieldsChange ? handleDeleteRow : undefined}
          />
        ),
        size: 40,
        enableResizing: false,
        enableHiding: false,
      },
    ],
    [updateField, handleDeleteRow, onFieldsChange]
  );

  return (
    <SchemaTable
      fields={fields}
      columns={columns}
      onFieldsChange={onFieldsChange}
      onAddRow={onFieldsChange ? handleAddRow : undefined}
    />
  );
}
