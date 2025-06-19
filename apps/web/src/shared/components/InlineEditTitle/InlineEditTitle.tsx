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
}

export function InlineEditTitle({
  title,
  onUpdate,
  className,
  errorMessage = 'Title cannot be empty',
  minWidth = '200px',
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
    if (editedTitle.trim() === '') {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editedTitle.trim() === '') {
        toast.error(errorMessage, {
          duration: 3000,
          position: 'top-right',
        });
        setEditedTitle(title);
        return;
      }
      void handleSubmit();
    } else if (e.key === 'Escape') {
      setEditedTitle(title);
    }
  };

  return (
    <h2 className={cn('m-0 cursor-pointer p-0 hover:opacity-80', className)}>
      <Textarea
        ref={textareaRef}
        value={editedTitle}
        onChange={e => {
          setEditedTitle(e.target.value);
          const textarea = e.target;
          textarea.style.height = 'auto';
          textarea.style.height = `${String(textarea.scrollHeight)}px`;
        }}
        onBlur={() => void handleSubmit()}
        onKeyDown={handleKeyDown}
        className={cn(
          'm-0 w-full border-0 p-0 shadow-none',
          'bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
          { 'opacity-50': isLoading }
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
