import { Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Textarea } from '@owox/ui/components/textarea';
import type { AiAssistantSessionListItemDto } from '../../model/ai-assistant/types/ai-assistant.dto.ts';
import { formatSessionTitle } from '../../model/ai-assistant/utils/ai-assistant-panel.utils.ts';

interface AiAssistantHistoryProps {
  sessions: AiAssistantSessionListItemDto[];
  currentSessionId?: string;
  isHistoryLoading: boolean;
  canEdit: boolean;
  renamingSessionId: string | null;
  renameDraft: string;
  onSessionSelect: (sessionId: string) => void;
  onStartRename: (item: AiAssistantSessionListItemDto) => void;
  onCancelRename: () => void;
  onRenameDraftChange: (value: string) => void;
  onRenameSubmit: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function AiAssistantHistory({
  sessions,
  currentSessionId,
  isHistoryLoading,
  canEdit,
  renamingSessionId,
  renameDraft,
  onSessionSelect,
  onStartRename,
  onCancelRename,
  onRenameDraftChange,
  onRenameSubmit,
  onDeleteSession,
}: AiAssistantHistoryProps) {
  if (isHistoryLoading) {
    return (
      <div className='text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        Loading chat history...
      </div>
    );
  }

  if (sessions.length === 0) {
    return <div className='text-muted-foreground px-2 py-3 text-sm'>No chats yet.</div>;
  }

  return (
    <div className='space-y-1'>
      {sessions.map(item => {
        const isActive = item.id === currentSessionId;
        const isRenaming = renamingSessionId === item.id;

        return (
          <div
            key={item.id}
            className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
              isActive ? 'bg-muted/60' : 'bg-background hover:bg-muted/40'
            } ${isRenaming ? 'pointer-events-none' : ''}`}
            role={isRenaming ? undefined : 'button'}
            tabIndex={isRenaming ? undefined : 0}
            onClick={() => {
              if (isRenaming) return;
              onSessionSelect(item.id);
            }}
            onKeyDown={event => {
              if (isRenaming) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSessionSelect(item.id);
              }
            }}
          >
            <div className='flex items-start gap-2'>
              <div className='min-w-0 flex-1'>
                {isRenaming ? (
                  <Textarea
                    value={renameDraft}
                    className='border-input focus-visible:ring-ring pointer-events-auto min-h-0 w-full resize-none rounded-md border bg-white px-2 py-1 text-sm font-medium shadow-sm focus-visible:ring-1 focus-visible:outline-none dark:bg-zinc-900'
                    rows={1}
                    onClick={event => {
                      event.stopPropagation();
                    }}
                    onChange={event => {
                      onRenameDraftChange(event.target.value);
                    }}
                    onBlur={() => {
                      onRenameSubmit(item.id);
                    }}
                    onKeyDown={event => {
                      event.stopPropagation();
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancelRename();
                        return;
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onRenameSubmit(item.id);
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <div className='truncate font-medium'>{formatSessionTitle(item)}</div>
                )}
                <div className='text-muted-foreground mt-1 text-xs'>
                  {new Date(item.updatedAt).toLocaleString()}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7 shrink-0'
                    onClick={event => {
                      event.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align='end'
                  onClick={event => {
                    event.stopPropagation();
                  }}
                >
                  <DropdownMenuItem
                    onClick={event => {
                      event.stopPropagation();
                      onStartRename(item);
                    }}
                    disabled={!canEdit}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className='text-destructive'
                    onClick={event => {
                      event.stopPropagation();
                      onDeleteSession(item.id);
                    }}
                    disabled={!canEdit}
                  >
                    <Trash2 className='text-destructive h-4 w-4' />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}
    </div>
  );
}
