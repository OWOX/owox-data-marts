import { useState, useEffect, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Textarea } from '@owox/ui/components/textarea';

export interface InlineEditDescriptionAiContext {
  /** Replace the current value in the open textarea. Does not persist on its own. */
  setValue: (value: string) => void;
}

export type InlineEditDescriptionAi =
  | ReactNode
  | ((ctx: InlineEditDescriptionAiContext) => ReactNode);

interface InlineEditDescriptionProps {
  description: string | null;
  onUpdate: (newDescription: string | null) => Promise<void>;
  className?: string;
  placeholder?: string;
  minWidth?: string;
  minHeight?: string;
  readOnly?: boolean;
  /**
   * Optional action button rendered inside the editor while editing. May be a
   * render-function that receives `{ setValue }` so the action can write directly
   * into the editor's local buffer (e.g. AI suggestion).
   */
  aiButton?: InlineEditDescriptionAi;
}

export function InlineEditDescription({
  description,
  onUpdate,
  className,
  placeholder = 'Add description...',
  minWidth = '100%',
  minHeight = '256px',
  readOnly = false,
  aiButton,
}: InlineEditDescriptionProps) {
  const [editedDescription, setEditedDescription] = useState(description ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditedDescription(description ?? '');
  }, [description]);

  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
      adjustTextareaHeight(textareaRef.current);
    }
  }, [isEditing]);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = `${String(textarea.scrollHeight)}px`;
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedDescription(e.target.value);
    adjustTextareaHeight(e.target);
  };

  const handleSubmit = async () => {
    const trimmedDescription = editedDescription.trim();
    const currentDescription = description ?? '';

    if (trimmedDescription === currentDescription) {
      setIsEditing(false);
      return;
    }

    try {
      setIsLoading(true);
      const newDescription = trimmedDescription === '' ? null : trimmedDescription;
      await onUpdate(newDescription);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update description:', error);
      setEditedDescription(description ?? '');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditedDescription(description ?? '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    const resolvedAiButton =
      typeof aiButton === 'function' ? aiButton({ setValue: setEditedDescription }) : aiButton;

    const editor = aiButton ? (
      // Shell-style editor: wrapper mimics textarea look; real <textarea> is borderless
      // and shares the visual surface with the AI button on the right.
      <div className={cn('flex w-full items-start gap-2 rounded-md bg-white p-2 dark:bg-white/4')}>
        <Textarea
          ref={textareaRef}
          value={editedDescription}
          onChange={handleTextareaChange}
          onBlur={() => void handleSubmit()}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'm-0 min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none',
            'focus-visible:border-0 focus-visible:ring-0 focus-visible:ring-offset-0',
            {
              'opacity-50': isLoading,
            }
          )}
          style={{
            fontSize: 'inherit',
            lineHeight: 'inherit',
            fontFamily: 'inherit',
            resize: 'none',
            minHeight: minHeight,
            // Inside flex shell we must NOT force textarea width — otherwise the AI
            // button gets pushed off-screen. Let flex-1 + min-w-0 handle sizing.
          }}
          disabled={isLoading}
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
          {resolvedAiButton}
        </span>
      </div>
    ) : (
      // Default editor (no AI button): preserves the original look so existing
      // consumers without `aiButton` see no visual regression.
      <Textarea
        ref={textareaRef}
        value={editedDescription}
        onChange={handleTextareaChange}
        onBlur={() => void handleSubmit()}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'm-0 w-full border-0 bg-white p-2 shadow-none dark:bg-white/4',
          'focus-visible:ring-primary focus-visible:ring-0',
          {
            'opacity-50': isLoading,
          }
        )}
        style={{
          fontSize: 'inherit',
          lineHeight: 'inherit',
          fontFamily: 'inherit',
          resize: 'none',
          minHeight: minHeight,
          minWidth: minWidth,
        }}
        disabled={isLoading}
      />
    );

    return (
      <div className='w-full'>
        {editor}
        <div className='mt-2 text-xs text-neutral-500'>
          <span>
            Press{' '}
            <kbd className='rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-sans dark:border-neutral-900 dark:bg-neutral-900'>
              Ctrl+Enter
            </kbd>{' '}
            to save •{' '}
          </span>
          <span>
            <kbd className='rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-sans dark:border-neutral-900 dark:bg-neutral-900'>
              Esc
            </kbd>{' '}
            to cancel •{' '}
          </span>
          <span>Changes are also saved when you click outside</span>
        </div>
      </div>
    );
  }

  return (
    <div className='flex w-full items-center gap-4 rounded-md border-b border-neutral-200 bg-white transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
      <div
        onClick={() => {
          if (!readOnly) {
            setIsEditing(true);
          }
        }}
        className={cn(
          'min-h-64 w-full rounded whitespace-pre-wrap',
          'transition-colors duration-150',
          readOnly ? 'cursor-default' : 'cursor-pointer',
          // Reserve right space equal to the AI-button column in edit mode so the
          // text wraps identically and doesn't shift when the user opens the editor.
          // Edit-mode reserves 48px on the right: wrapper p-2 right (8px) +
          // gap-2 (8px) + AI button width (32px). pl-2 mirrors edit's wrapper p-2 left.
          aiButton ? 'py-2 pr-12 pl-2' : 'p-2',
          !description && 'text-muted-foreground/50',
          className
        )}
        style={{ minWidth: minWidth }}
      >
        {description ?? placeholder}
      </div>
    </div>
  );
}
