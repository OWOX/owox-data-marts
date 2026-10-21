import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { Check, Copy, Maximize2, Minimize2, Pencil } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { cn } from '@owox/ui/lib/utils';
import { useClipboard } from '../../../hooks/useClipboard';
import { trackEvent } from '../../../utils/data-layer';
import { MarkdownEditorPreview } from '../MarkdownEditor';
import { ExpandableEditor } from '../MarkdownEditor/ExpandableEditor';
import { useDescriptionPreview } from './useDescriptionPreview';

export type DescriptionScope = 'project' | 'context' | 'data_mart';

function trackDescriptionAction(scope: DescriptionScope, action: 'edit' | 'copy') {
  trackEvent({
    event: `description_${action}`,
    category: 'Description',
    action: action === 'edit' ? 'Edit' : 'Copy',
    label: scope,
  });
}

export function CopyDescriptionButton({
  value,
  scope,
}: {
  value: string;
  scope: DescriptionScope;
}) {
  const { copiedSection, copyToClipboard } = useClipboard();
  const [failed, setFailed] = useState(false);
  const copied = copiedSection === 'description';
  const label = copied ? 'Copied as Markdown' : 'Copy as Markdown';

  return (
    <div className='flex items-center gap-2'>
      {failed && (
        <span className='text-destructive text-xs' role='alert'>
          Could not copy description. Try again.
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={label}
            disabled={!value}
            onClick={() => {
              void copyToClipboard(value, 'description').then(success => {
                setFailed(!success);
                if (success) trackDescriptionAction(scope, 'copy');
              });
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

interface DescriptionViewProps {
  projectId: string;
  value: string;
  placeholder?: string;
  scope: DescriptionScope;
  onEdit?: () => void;
  disabled?: boolean;
  editButtonProps?: ComponentPropsWithRef<'button'>;
}

export function DescriptionView({
  projectId,
  value,
  placeholder = 'No description yet.',
  scope,
  onEdit,
  disabled = false,
  editButtonProps,
}: DescriptionViewProps) {
  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const content = useDescriptionPreview({ markdown: value, projectId, debounceMs: 0 });

  return (
    <ExpandableEditor
      expanded={expanded}
      onExpandedChange={setExpanded}
      title='Description'
      focusTargetRef={expandButtonRef}
    >
      <div
        className={cn(
          'w-full min-w-0 space-y-2',
          expanded && 'flex min-h-0 flex-1 flex-col gap-2 space-y-0'
        )}
        data-testid='descriptionView'
      >
        <div className='flex shrink-0 items-center justify-end gap-1'>
          <CopyDescriptionButton value={value} scope={scope} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={expandButtonRef}
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={expanded ? 'Exit full screen' : 'Expand description'}
                aria-expanded={expanded}
                onClick={() => {
                  setExpanded(!expanded);
                }}
              >
                {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{expanded ? 'Exit full screen' : 'Expand description'}</TooltipContent>
          </Tooltip>
          {onEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  {...editButtonProps}
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  aria-label='Edit description'
                  disabled={disabled}
                  onClick={() => {
                    setExpanded(false);
                    trackDescriptionAction(scope, 'edit');
                    onEdit();
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit description</TooltipContent>
            </Tooltip>
          )}
        </div>
        {!value.trim() || content.loading || content.error || !content.html ? (
          <p
            className={cn(
              'text-muted-foreground min-h-24 whitespace-pre-wrap',
              expanded && 'min-h-0 flex-1 overflow-auto'
            )}
          >
            {value.trim() ? value : placeholder}
          </p>
        ) : (
          <MarkdownEditorPreview
            {...content}
            title='Description'
            height={expanded ? '100%' : 240}
            className={expanded ? 'min-h-0 flex-1' : undefined}
          />
        )}
        {content.error && (
          <p className='text-muted-foreground text-xs' role='status'>
            Formatting is unavailable. Your description is shown as text.
          </p>
        )}
      </div>
    </ExpandableEditor>
  );
}
