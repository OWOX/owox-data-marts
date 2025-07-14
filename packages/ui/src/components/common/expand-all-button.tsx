import { Button } from '@owox/ui/components/button';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

/**
 * Props for the ExpandAllButton component
 */
interface ExpandAllButtonProps {
  /** Whether all items are currently expanded */
  isAllExpanded: boolean;
  /** Function to call when the button is clicked */
  onToggle: () => void;
}

/**
 * Button component for expanding/collapsing all items at once
 */
export function ExpandAllButton({ isAllExpanded, onToggle }: ExpandAllButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-5 w-5 cursor-pointer p-0"
      onClick={onToggle}
      title={isAllExpanded ? 'Collapse all items' : 'Expand all items'}
    >
      {isAllExpanded ? (
        <ChevronsDownUp className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4" />
      )}
    </Button>
  );
}
