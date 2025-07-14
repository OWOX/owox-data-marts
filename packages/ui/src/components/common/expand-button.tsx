import { Button } from '@owox/ui/components/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Props for the ExpandButton component
 */
interface ExpandButtonProps {
  /** Whether the content is currently expanded */
  isExpanded: boolean;
  /** Function to call when the button is clicked */
  onToggle: () => void;
  /** Optional aria-label override */
  ariaLabel?: string;
}

/**
 * Generic button component for expanding/collapsing content
 */
export function ExpandButton({ isExpanded, onToggle, ariaLabel }: ExpandButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-5 w-5 p-0 cursor-pointer"
      onClick={onToggle}
      aria-label={ariaLabel ?? (isExpanded ? 'Collapse' : 'Expand')}
    >
      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </Button>
  );
}
