import * as React from 'react';
import { Textarea } from './textarea.js';
import { cn } from '@owox/ui/lib/utils';
import { FileDown } from 'lucide-react';

interface FileDropTextareaProps extends React.ComponentProps<'textarea'> {
  onFileRead?: (content: string) => void;
  onFileReject?: (message: string) => void;
  allowedExtensions?: string[];
}

const FileDropTextarea = React.forwardRef<HTMLTextAreaElement, FileDropTextareaProps>(
  ({ className, onFileRead, onFileReject, allowedExtensions = ['.json'], ...props }, ref) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        const fileName = file.name.toLowerCase();
        const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

        if (isValidExtension) {
          const reader = new FileReader();
          reader.onload = event => {
            const text = event.target?.result;
            if (typeof text === 'string') {
              if (fileName.endsWith('.json')) {
                try {
                  JSON.parse(text);
                } catch {
                  if (onFileReject) {
                    onFileReject('File is not a valid JSON');
                  }
                  return;
                }
              }
              if (onFileRead) {
                onFileRead(text);
              }
            }
          };
          reader.onerror = () => {
            if (onFileReject) {
              onFileReject('Failed to read file');
            }
          };
          reader.readAsText(file);
        } else {
          if (onFileReject) {
            onFileReject(
              `Invalid file type. Only ${allowedExtensions.join(', ')} files are allowed.`
            );
          }
        }
      }
    };

    return (
      <div
        className='relative w-full'
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          ref={ref}
          className={cn(isDragging && 'border-primary ring-primary/20 ring-[3px]', className)}
          {...props}
        />
        {isDragging && (
          <div className='bg-background/80 border-primary animate-in fade-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-md border-2 border-dashed backdrop-blur-[2px] duration-100'>
            <FileDown className='text-primary mb-2 h-8 w-8 animate-bounce' />
            <span className='text-foreground text-sm font-medium'>Drop JSON file here</span>
          </div>
        )}
      </div>
    );
  }
);

FileDropTextarea.displayName = 'FileDropTextarea';

export { FileDropTextarea };
