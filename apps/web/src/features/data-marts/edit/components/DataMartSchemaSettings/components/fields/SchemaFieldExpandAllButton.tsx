import { Button } from '@owox/ui/components/button';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

/**
 * Props for the SchemaFieldExpandAllButton component
 */
interface SchemaFieldExpandAllButtonProps {
  /** Whether all fields are currently expanded */
  isAllExpanded: boolean;
  /** Function to call when the button is clicked */
  onToggle: () => void;
}

/**
 * Button component for expanding/collapsing all nested fields
 */
export function SchemaFieldExpandAllButton({
  isAllExpanded,
  onToggle,
}: SchemaFieldExpandAllButtonProps) {
  return (
    <Button
      variant='ghost'
      size='icon'
      className='h-5 w-5 cursor-pointer p-0'
      onClick={onToggle}
      title={isAllExpanded ? 'Collapse all nested fields' : 'Expand all nested fields'}
    >
      {isAllExpanded ? (
        <ChevronsDownUp className='h-4 w-4' />
      ) : (
        <ChevronsUpDown className='h-4 w-4' />
      )}
    </Button>
  );
}
