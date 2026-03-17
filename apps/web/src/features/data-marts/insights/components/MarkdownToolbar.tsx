import { useState } from 'react';
import { ChevronDown, ChevronUp, Heading } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { Badge } from '@owox/ui/components/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { MARKDOWN_ACTIONS, HEADING_LEVELS } from './InsightTemplateEditor.constants';
import type { MarkdownAction } from './InsightTemplateEditor.constants';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';

export interface MarkdownToolbarProps {
  readOnly?: boolean;
  showToolbar?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  onActionClick: (actionId: MarkdownAction['id']) => void;
  onHeadingClick: (level: number) => void;
}

export function MarkdownToolbar({
  readOnly = false,
  showToolbar = true,
  collapsible = false,
  defaultCollapsed = false,
  onActionClick,
  onHeadingClick,
}: MarkdownToolbarProps) {
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (!showToolbar) return null;

  return (
    <div className='bg-muted/40 flex items-center gap-2 border-b px-3 py-1 text-xs'>
      {!isCollapsed && (
        <div className='flex flex-1 items-center gap-1'>
          <DropdownMenu open={headingMenuOpen} onOpenChange={setHeadingMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    disabled={readOnly}
                    aria-label='Heading level'
                  >
                    <Heading className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Heading</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align='end'
              onCloseAutoFocus={event => {
                event.preventDefault();
              }}
            >
              {HEADING_LEVELS.map(level => (
                <DropdownMenuItem
                  key={level}
                  onSelect={() => {
                    setHeadingMenuOpen(false);
                    onHeadingClick(level);
                  }}
                >
                  H{level} Heading {level}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {MARKDOWN_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-8 w-8'
                    disabled={readOnly}
                    onClick={() => {
                      onActionClick(action.id);
                    }}
                    aria-label={action.label}
                  >
                    <Icon className='h-4 w-4' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
      <div className='flex items-center gap-2'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant='outline'
              className='text-muted-foreground cursor-help px-2 py-0.5 font-normal'
            >
              Markdown
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              This editor uses Markdown formatting.{' '}
              <ExternalAnchor
                href='https://www.markdownguide.org/basic-syntax/'
                className='hover:text-foreground text-tooltip underline'
              >
                Learn more
              </ExternalAnchor>
            </p>
          </TooltipContent>
        </Tooltip>
        {collapsible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={() => {
                  setIsCollapsed(!isCollapsed);
                }}
                aria-label={isCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}
              >
                {isCollapsed ? (
                  <ChevronDown className='h-4 w-4' />
                ) : (
                  <ChevronUp className='h-4 w-4' />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
