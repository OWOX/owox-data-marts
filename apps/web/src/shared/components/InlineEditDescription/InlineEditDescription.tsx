import { useState, useEffect, type KeyboardEvent, useRef } from 'react';
import { cn } from '@owox/ui/lib/utils';
import { Textarea } from '@owox/ui/components/textarea';
import toast from 'react-hot-toast';

interface InlineEditDescriptionProps {
  description: string | null;
  onUpdate: (newDescription: string | null) => Promise<void>;
  className?: string;
  placeholder?: string;
  minWidth?: string;
  minHeight?: string;
}

export function InlineEditDescription({
  description,
  onUpdate,
  className,
  placeholder = 'Add description...',
  minWidth = '100%',
  minHeight = '100px',
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

    toast.success('Description updated');

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
      toast.error('Failed to update description');
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
    return (
      <div className='w-full'>
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
            resize: 'vertical',
            minHeight: minHeight,
            minWidth: minWidth,
          }}
          disabled={isLoading}
        />
        <div className='mt-2 text-xs text-gray-500'>
          <span>
            Press{' '}
            <kbd className='rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-sans'>
              Ctrl+Enter
            </kbd>{' '}
            to save •{' '}
          </span>
          <span>
            <kbd className='rounded border border-gray-300 bg-gray-100 px-1 py-0.5 font-sans'>
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
    <div className='flex w-full items-center gap-4 rounded-md border-b border-gray-200 bg-white transition-shadow duration-200 hover:shadow-sm dark:border-0 dark:bg-white/4'>
      <div
        onClick={() => {
          setIsEditing(true);
        }}
        className={cn(
          'min-h-24 cursor-pointer rounded p-2 whitespace-pre-wrap',
          'transition-colors duration-150',
          !description && 'text-gray-400 italic',
          className
        )}
        style={{ minWidth: minWidth }}
      >
        {description ?? placeholder}
      </div>
    </div>
  );
}
