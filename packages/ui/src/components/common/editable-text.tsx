import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Textarea } from '@owox/ui/components/textarea';
import { cn } from '@owox/ui/lib/utils';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';

/**
 * Helpers passed to a `editorAction` render-function so the action (e.g. AI generate)
 * can write directly into the editor's local buffer without going through the parent
 * state. Use this when the action should populate the textarea for user review before
 * the user explicitly clicks Apply.
 */
export interface EditableTextActionContext {
  /** Replace the current value in the open textarea. Does not persist on its own. */
  setValue: (value: string) => void;
}

/**
 * Slot for the in-editor action (e.g. AI generate). Either a static node, or a
 * render-function that receives `EditableTextActionContext` and can write into the
 * editor's local buffer.
 */
export type EditableTextAction = ReactNode | ((ctx: EditableTextActionContext) => ReactNode);

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
  /** Optional slot rendered inline after the value (e.g., a status icon). Keeps the full-width click area for editing. */
  trailingContent?: ReactNode;
  /**
   * Optional in-editor action (e.g. AI generate). When provided, an inline shell is
   * rendered around the textarea with the action on the right. May be a render-function
   * that receives a `setValue` helper to write directly into the open textarea.
   */
  editorAction?: EditableTextAction;
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
  saveButtonText = 'Apply',
  cancelButtonText = 'Cancel',
  trailingContent,
  editorAction,
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
            trailingContent && 'flex items-center gap-1.5',
            className
          )}
        >
          {value || placeholder}
          {trailingContent}
        </div>
      </PopoverTrigger>
      <PopoverContent className='w-auto max-w-[600px] min-w-[300px] p-2' align='start'>
        {editorAction ? (
          // Shell-style editor: wrapper mimics a Textarea (border/ring/padding).
          // The real <textarea> is borderless and shares the visible surface with the
          // action button on the right. Only enabled when an action is provided so
          // existing consumers without `editorAction` see no visual regression.
          <div
            className={cn(
              'border-input dark:bg-input/30 flex items-start gap-2 rounded-md border bg-transparent px-3 py-2 shadow-xs',
              'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]'
            )}
          >
            <Textarea
              ref={textareaRef}
              value={editedValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className={cn(
                'min-h-[24px] min-w-0 flex-1 resize-y border-0 bg-transparent p-0 shadow-none',
                'focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0'
              )}
              style={{ minHeight: String(Math.max(minRows * 24, 24)) + 'px' }}
              rows={minRows}
              data-gramm='false'
              data-gramm_editor='false'
              data-enable-grammarly='false'
            />
            <span
              onMouseDown={e => {
                e.preventDefault();
              }}
              className='shrink-0'
            >
              {typeof editorAction === 'function'
                ? editorAction({ setValue: setEditedValue })
                : editorAction}
            </span>
          </div>
        ) : (
          // Default editor (no action): preserves the original Textarea look.
          <Textarea
            ref={textareaRef}
            value={editedValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className='min-h-[24px] resize-y'
            style={{ minHeight: String(Math.max(minRows * 24, 24)) + 'px' }}
            rows={minRows}
          />
        )}
        <div className='mt-3 flex justify-end gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleCancel}
            className='h-7 cursor-pointer px-2 text-xs'
          >
            {cancelButtonText}
          </Button>
          <Button size='sm' onClick={handleSave} className='h-7 cursor-pointer px-2 text-xs'>
            {saveButtonText}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
