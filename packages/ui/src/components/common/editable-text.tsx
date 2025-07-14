import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Textarea } from '@owox/ui/components/textarea';
import { cn } from '@owox/ui/lib/utils';
import { type KeyboardEvent, useRef, useState } from 'react';

/**
 * Props for the EditableText component
 */
export interface EditableTextProps {
  /** The current value of the text field */
  value: string;
  /** Optional placeholder text to display when the value is empty */
  placeholder?: string;
  /** Callback function to call when the value changes */
  onValueChange?: (newValue: string) => void;
  /** Minimum number of rows for the textarea */
  minRows?: number;
  /** Whether to display the text with slightly bolder font weight */
  isBold?: boolean;
  /** Additional CSS classes for the trigger element */
  className?: string;
  /** Custom save button text */
  saveButtonText?: string;
  /** Custom cancel button text */
  cancelButtonText?: string;
}

/**
 * Generic component for inline text editing with a popover editor
 */
export function EditableText({
  value,
  placeholder = '',
  onValueChange,
  minRows = 1,
  isBold = false,
  className,
  saveButtonText = 'Save',
  cancelButtonText = 'Discard',
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle textarea change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedValue(e.target.value);
  };

  // Handle save
  const handleSave = () => {
    if (onValueChange && editedValue !== value) {
      onValueChange(editedValue.trim());
    }
    setIsEditing(false);
  };

  // Handle cancel
  const handleCancel = () => {
    setEditedValue(value);
    setIsEditing(false);
  };

  // Handle key down events
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (minRows === 1 || e.ctrlKey) {
        e.preventDefault();
        handleSave();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  // Focus textarea when popover opens
  const handleOpenChange = (open: boolean) => {
    setIsEditing(open);
    if (open) {
      setEditedValue(value);
      // Use setTimeout to ensure the textarea is rendered before focusing
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 0);
    } else {
      handleCancel();
    }
  };

  return (
    <Popover open={isEditing} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            'cursor-edit w-full min-w-[100px]',
            !value && 'text-gray-400',
            isBold && 'font-medium',
            className
          )}
        >
          {value || placeholder}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[600px] min-w-[300px] p-2" align="start">
        <Textarea
          ref={textareaRef}
          value={editedValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="min-h-[24px] resize-y"
          style={{ minHeight: String(Math.max(minRows * 24, 24)) + 'px' }}
          rows={minRows}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="h-7 cursor-pointer px-2 text-xs"
          >
            {cancelButtonText}
          </Button>
          <Button size="sm" onClick={handleSave} className="h-7 cursor-pointer px-2 text-xs">
            {saveButtonText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
