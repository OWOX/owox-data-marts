import { Button } from '@owox/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@owox/ui/components/popover';
import { Textarea } from '@owox/ui/components/textarea';
import { cn } from '@owox/ui/lib/utils';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

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
 * What a `renderEditor` custom editor is handed: the popover's live buffer, and the same two
 * actions the Apply and Cancel buttons run.
 */
export interface EditableTextEditorContext {
  /** The buffer being edited. Reset to `value` every time the popover opens. */
  value: string;
  /** Writes into the buffer. Also clears the message a refused Apply left behind. */
  setValue: (value: string) => void;
  /** Commit the buffer — exactly what Apply does, refusal included. */
  apply: () => void;
  /** Discard the buffer and close — exactly what Cancel does. */
  cancel: () => void;
}

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
  /**
   * Replaces the built-in textarea with a custom editor (e.g. a code editor), keeping this
   * popover's chrome: the trigger, Apply/Cancel, and dismissal stay the ones every other editable
   * cell uses. `editorAction` is ignored when this is set.
   */
  renderEditor?: (ctx: EditableTextEditorContext) => ReactNode;
  /**
   * Commit path for a custom editor, replacing `onValueChange`. Return a message to REFUSE the
   * edit: the popover stays open and shows that message beside Apply.
   *
   * Receives the buffer untrimmed, unlike `onValueChange` — a custom editor may carry companion
   * state whose offsets are relative to the exact buffer it was derived from.
   */
  onApply?: (value: string) => string | null | undefined;
  /**
   * Called when the popover opens, before the buffer is reset — e.g. so a custom editor's owner can
   * drop companion state left over from an edit that was cancelled.
   */
  onEditStart?: () => void;
  /**
   * Called when the popover closes, however it closed — Apply, Cancel, Escape or a click outside.
   * Pairs with `onEditStart` for owners that suppress something of their own while the editor is
   * open; this component reports the transition because nothing outside it can observe one.
   */
  onEditEnd?: () => void;
  /**
   * Heading for the open popover — which row is being edited, once the popover covers it. Omitted
   * by default, so a cell that does not ask for one looks exactly as it did.
   */
  editorTitle?: ReactNode;
  /**
   * A line in the footer's otherwise empty left half: what this editor expects, where to read more.
   * An Apply refusal takes the same space while there is one, because the two are answers to the
   * same question and only one of them can be the current answer.
   *
   * Without this prop a refusal keeps its old place above the footer, so consumers that do not opt
   * in are untouched.
   */
  editorHint?: ReactNode;
  /**
   * Renders the trigger's value as something other than plain text — field chips, here. Given the
   * value so a caller can keep this a pure function of what is on screen. The placeholder for an
   * empty value is never routed through it.
   */
  renderValue?: (value: string) => ReactNode;
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
  renderEditor,
  onApply,
  onEditStart,
  onEditEnd,
  editorTitle,
  editorHint,
  renderValue,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Reported from the state itself, not from the close handlers: Apply and Cancel both lower
  // `isEditing` directly, so hooking any one route would miss the others.
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) onEditEnd?.();
    wasEditingRef.current = isEditing;
  }, [isEditing, onEditEnd]);
  const [editedValue, setEditedValue] = useState(value);
  // Why an Apply can be refused: only `onApply` ever refuses one, so without it this stays null.
  const [applyError, setApplyError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  const writeValue = (next: string) => {
    setEditedValue(next);
    setApplyError(null);
  };

  // Handle textarea change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    writeValue(e.target.value);
  };

  // Handle save
  const handleSave = () => {
    if (editedValue !== value) {
      if (onApply) {
        const refusal = onApply(editedValue);
        if (refusal) {
          setApplyError(refusal);
          return;
        }
      } else if (onValueChange) {
        onValueChange(editedValue.trim());
      }
    }
    setApplyError(null);
    setIsEditing(false);
  };

  // Handle cancel
  const handleCancel = () => {
    setEditedValue(value);
    setApplyError(null);
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
      onEditStart?.();
      setApplyError(null);
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
          // Radix contributes `onClick` and the `aria-*` state and nothing else, so the element it
          // is given has to be the control: without a role and a tab stop this cell is invisible to
          // Tab, and a <div> fires no click from Enter or Space either. It is also what the
          // popover's close-autofocus returns focus to — an unfocusable node sends it to <body>.
          role='button'
          tabIndex={0}
          onKeyDown={e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            // Space would scroll the page, Enter would submit an enclosing form.
            e.preventDefault();
            handleOpenChange(true);
          }}
          className={cn(
            'cursor-edit w-full min-w-[100px]',
            !value && 'text-gray-400',
            isBold && 'font-medium',
            trailingContent && 'flex items-center gap-1.5',
            className
          )}
        >
          {value ? (renderValue?.(value) ?? value) : placeholder}
          {trailingContent}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className='w-auto max-w-[600px] min-w-[300px] p-2'
        align='start'
        // The dialog's accessible name. Only when there IS a title — pointing at an absent element
        // would leave it worse named than the default.
        aria-labelledby={editorTitle ? titleId : undefined}
        // A CUSTOM editor focuses itself, and it may not exist yet: a code editor loads
        // asynchronously, so Radix's open-autofocus reaches the first candidate — Cancel — long
        // before the editor is there to take it. Left alone, the analyst types into a button and
        // Enter discards their work. The built-in textarea path keeps the default: it is rendered
        // synchronously and the focus effect above already puts the caret in it.
        onOpenAutoFocus={renderEditor ? event => event.preventDefault() : undefined}
      >
        {editorTitle && (
          <h4
            id={titleId}
            // Truncated, so the full name has to stay recoverable somewhere.
            title={typeof editorTitle === 'string' ? editorTitle : undefined}
            className='text-foreground mb-2 truncate text-sm font-medium'
          >
            {editorTitle}
          </h4>
        )}
        {renderEditor ? (
          renderEditor({
            value: editedValue,
            setValue: writeValue,
            apply: handleSave,
            cancel: handleCancel,
          })
        ) : editorAction ? (
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
                'min-h-[24px] min-w-0 flex-1 resize-none border-0 bg-transparent p-0 shadow-none',
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
                ? editorAction({ setValue: writeValue })
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
        {applyError && !editorHint && (
          <p role='alert' className='text-destructive mt-2 text-sm whitespace-normal'>
            {applyError}
          </p>
        )}
        {/* `flex-1` on the hint is what pushes the buttons right, so the footer's own classes —
            and every consumer that passes no hint — stay exactly as they were. */}
        <div className='mt-3 flex justify-end gap-2'>
          {editorHint && (
            <div className='text-muted-foreground min-w-0 flex-1 self-center text-xs whitespace-normal'>
              {applyError ? (
                <span role='alert' className='text-destructive'>
                  {applyError}
                </span>
              ) : (
                editorHint
              )}
            </div>
          )}
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
