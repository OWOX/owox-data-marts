import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { type Row } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmationDialog } from '../../../../../../../shared/components/ConfirmationDialog';

/**
 * Props for the SchemaFieldActionsButton component
 */
interface SchemaFieldActionsButtonProps<TData> {
  /** Row data for row-specific actions */
  row: Row<TData>;
  /** Callback function to delete a row */
  onDeleteRow?: (index: number) => void;
  /** Callback function to add a nested field to a record type */
  onAddNestedField?: (index: number) => void;
  /** Function to check if a field is a record type */
  isRecordType?: (index: number) => boolean;
}

/**
 * Component that provides a dropdown menu for schema field row actions
 */
export function SchemaFieldActionsButton<TData>({
  row,
  onDeleteRow,
  onAddNestedField,
  isRecordType,
}: SchemaFieldActionsButtonProps<TData>) {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handleDeleteConfirm = () => {
    if (onDeleteRow) {
      onDeleteRow(row.index);
    }
    setIsDeleteConfirmOpen(false);
  };

  const showAddNestedField = isRecordType && onAddNestedField && isRecordType(row.index);
  const showDeleteField = !!onDeleteRow;
  const showSeparator = showAddNestedField && showDeleteField;

  return (
    <div className='px-3 text-right'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='dm-card-table-body-row-actionbtn opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100'
            aria-label='Row actions'
          >
            <MoreHorizontal className='dm-card-table-body-row-actionbtn-icon' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {showAddNestedField && (
            <DropdownMenuItem
              className='cursor-pointer'
              onClick={() => {
                onAddNestedField(row.index);
              }}
            >
              <Plus className='mr-2 h-4 w-4' />
              Add nested field
            </DropdownMenuItem>
          )}

          {showSeparator && <DropdownMenuSeparator />}

          {showDeleteField && (
            <DropdownMenuItem
              className='text-destructive focus:text-destructive cursor-pointer'
              onClick={() => {
                setIsDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              Delete field
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title='Delete field'
        description='Are you sure you want to delete this field?'
        confirmLabel='Delete'
        cancelLabel='Cancel'
        onConfirm={handleDeleteConfirm}
        variant='destructive'
      />
    </div>
  );
}
