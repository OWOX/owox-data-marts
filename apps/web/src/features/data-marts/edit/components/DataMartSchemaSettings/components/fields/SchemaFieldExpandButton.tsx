import { Button } from '@owox/ui/components/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Props for the SchemaFieldExpandButton component
 */
interface SchemaFieldExpandButtonProps {
  /** Whether the field is currently expanded */
  isExpanded: boolean;
  /** Function to call when the button is clicked */
  onToggle: () => void;
}

/**
 * Button component for expanding/collapsing a single nested field
 */
export function SchemaFieldExpandButton({ isExpanded, onToggle }: SchemaFieldExpandButtonProps) {
  return (
    <Button
      variant='ghost'
      size='icon'
      className='h-5 w-5 p-0'
      onClick={onToggle}
      aria-label={isExpanded ? 'Collapse nested fields' : 'Expand nested fields'}
    >
      {isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
    </Button>
  );
}
