import { useState, useEffect, type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Textarea } from '@owox/ui/components/textarea';
import toast from 'react-hot-toast';

export interface InlineEditTitleAiContext {
  /** Replace the current value in the open input. Does not persist on its own. */
  setValue: (value: string) => void;
}

export type InlineEditTitleAi = ReactNode | ((ctx: InlineEditTitleAiContext) => ReactNode);

interface InlineEditTitleProps {
  title: string;
  onUpdate: (newTitle: string) => Promise<void>;
  className?: string;
  errorMessage?: string;
  minWidth?: string;
  readOnly?: boolean;
  /**
   * Optional action button rendered on the right of the input, visible only while
   * focused. May be a render-function that receives `{ setValue }` so the action
   * can write directly into the editor's local buffer (e.g. AI suggestion).
   */
  aiButton?: InlineEditTitleAi;
}

export function InlineEditTitle({
  title,
  onUpdate,
  className,
  errorMessage = 'Title cannot be empty',
  minWidth = '100px',
  readOnly = false,
  aiButton,
}: InlineEditTitleProps) {
  const [editedTitle, setEditedTitle] = useState(title);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditedTitle(title);
  }, [title]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${String(textareaRef.current.scrollHeight)}px`;
    }
  }, [editedTitle]);

  const handleSubmit = async () => {
    if (readOnly || editedTitle.trim() === '') {
      setEditedTitle(title);
      return;
    }

    if (editedTitle.trim() === title) {
      return;
    }

    try {
      setIsLoading(true);
      await onUpdate(editedTitle.trim());
    } catch (error) {
      setEditedTitle(title);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editedTitle.trim() === '') {
        toast.error(errorMessage);
        setEditedTitle(title);
        return;
      }
      void handleSubmit();
    } else if (e.key === 'Escape') {
      setEditedTitle(title);
    }
  };

  const showAiButton = !!aiButton && !readOnly && isFocused;

  const textareaEl = (
    <Textarea
      ref={textareaRef}
      value={editedTitle}
      readOnly={readOnly}
      onChange={e => {
        if (readOnly) return;
        setEditedTitle(e.target.value);
        const textarea = e.target;
        textarea.style.height = 'auto';
        textarea.style.height = `${String(textarea.scrollHeight)}px`;
      }}
      onFocus={() => {
        setIsFocused(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        if (!readOnly) void handleSubmit();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'm-0 border-0 p-0 shadow-none',
        'bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
        'break-words whitespace-normal',
        aiButton ? 'min-w-0 flex-1' : 'w-full',
        {
          'opacity-50': isLoading,
          'cursor-default': readOnly,
        }
      )}
      style={{
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit',
        fontFamily: 'inherit',
        color: 'inherit',
        resize: 'none',
        overflow: 'hidden',
        minHeight: 'inherit',
        height: 'auto',
        // When the AI button takes part of the row we must let flex shrink the
        // textarea below 100%; otherwise the button is pushed off-screen.
        minWidth: aiButton ? 0 : minWidth,
      }}
      disabled={isLoading}
      data-gramm='false'
      data-gramm_editor='false'
      data-enable-grammarly='false'
    />
  );

  return (
    <h2
      className={cn('m-0 min-w-0 p-0', className, {
        'cursor-pointer hover:opacity-80': !readOnly,
      })}
    >
      {aiButton ? (
        <div className='flex min-w-0 items-start gap-1'>
          {textareaEl}
          {showAiButton && (
            <span
              onMouseDown={e => {
                e.preventDefault();
              }}
              className='shrink-0'
            >
              {typeof aiButton === 'function' ? aiButton({ setValue: setEditedTitle }) : aiButton}
            </span>
          )}
        </div>
      ) : (
        textareaEl
      )}
    </h2>
  );
}
