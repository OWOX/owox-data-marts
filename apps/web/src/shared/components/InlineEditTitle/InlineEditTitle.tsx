import { useState, useEffect, type KeyboardEvent, useRef } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Textarea } from '@owox/ui/components/textarea';
import toast from 'react-hot-toast';

interface InlineEditTitleProps {
  title: string;
  onUpdate: (newTitle: string) => Promise<void>;
  className?: string;
  errorMessage?: string;
  minWidth?: string;
  readOnly?: boolean;
}

export function InlineEditTitle({
  title,
  onUpdate,
  className,
  errorMessage = 'Title cannot be empty',
  minWidth = '200px',
  readOnly = false,
}: InlineEditTitleProps) {
  const [editedTitle, setEditedTitle] = useState(title);
  const [isLoading, setIsLoading] = useState(false);
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

  return (
    <h2
      className={cn('m-0 p-0', className, {
        'cursor-pointer hover:opacity-80': !readOnly,
      })}
    >
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
        onBlur={() => !readOnly && void handleSubmit()}
        onKeyDown={handleKeyDown}
        className={cn(
          'm-0 w-full border-0 p-0 shadow-none',
          'bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
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
          minWidth: minWidth,
        }}
        disabled={isLoading}
      />
    </h2>
  );
}
