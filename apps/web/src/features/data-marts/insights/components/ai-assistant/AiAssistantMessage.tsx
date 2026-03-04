import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import type { AiAssistantMessageDto } from '../../model/ai-assistant/types/ai-assistant.dto.ts';
import type { AssistantMessageDetails } from '../../model/ai-assistant/types/ai-assistant-panel.types.ts';
import { SqlPreview } from './SqlPreview.tsx';

interface AiAssistantMessageProps {
  message: AiAssistantMessageDto;
  details: AssistantMessageDetails | null;
  canEdit: boolean;
  isApplying: boolean;
  isHeavyProcessing: boolean;
  expandedSqlIds: Set<string>;
  onToggleSql: (messageId: string) => void;
  onApplyAction: (params: {
    assistantMessageId: string;
    actionId: string;
    shouldRun?: boolean;
  }) => void;
}

export function AiAssistantMessage({
  message,
  details,
  canEdit,
  isApplying,
  isHeavyProcessing,
  expandedSqlIds,
  onToggleSql,
  onApplyAction,
}: AiAssistantMessageProps) {
  if (message.role === 'system') return null;

  if (message.role === 'user') {
    return (
      <div className='flex justify-end'>
        <div className='bg-muted text-foreground max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm break-words whitespace-pre-wrap'>
          {message.content}
        </div>
      </div>
    );
  }

  const isApplied = message.applyStatus === 'applied';
  const shouldShowActionsSection = isApplied || Boolean(details?.hasActions);
  const applyChangesActionId = details?.applyChangesAction?.id ?? null;
  const createAndAttachActionId = details?.createAndAttachAction?.id ?? null;
  const insertIntoTemplateActionId = details?.insertIntoTemplateAction?.id ?? null;
  const applyTemplateEditActionId = details?.applyTemplateEditAction?.id ?? null;

  return (
    <div className='flex items-start gap-2'>
      <div className='border-border bg-muted mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border'>
        <Sparkles className='text-muted-foreground h-3 w-3' />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='bg-muted rounded-2xl rounded-tl-sm px-3 py-2.5 text-sm'>
          <div className='break-words whitespace-pre-wrap'>{message.content}</div>

          {details?.sqlCandidate && (
            <div className='mt-3'>
              <button
                className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors'
                onClick={() => {
                  onToggleSql(message.id);
                }}
              >
                {expandedSqlIds.has(message.id) ? (
                  <ChevronDown className='h-3 w-3' />
                ) : (
                  <ChevronRight className='h-3 w-3' />
                )}
                <Sparkles className='h-3 w-3' />
                Generated SQL
              </button>
              {expandedSqlIds.has(message.id) && (
                <div className='mt-1.5'>
                  <SqlPreview sql={details.sqlCandidate} />
                </div>
              )}
            </div>
          )}

          {shouldShowActionsSection && (
            <div className='border-border/50 mt-3 space-y-2 border-t pt-2'>
              {isApplied ? (
                <div className='text-xs font-medium text-green-600 dark:text-green-400'>
                  ✓ Applied
                </div>
              ) : (
                <div className='flex flex-wrap gap-2'>
                  {applyChangesActionId && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: applyChangesActionId,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    >
                      Apply changes to source
                    </Button>
                  )}
                  {createAndAttachActionId && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: createAndAttachActionId,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    >
                      Create source and attach
                    </Button>
                  )}
                  {insertIntoTemplateActionId && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: insertIntoTemplateActionId,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    >
                      Reuse source
                    </Button>
                  )}
                  {applyTemplateEditActionId && (
                    <div className='group bg-background hover:bg-accent flex items-center overflow-hidden rounded-md border transition-colors'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-8 rounded-none border-r px-3'
                        onClick={() => {
                          onApplyAction({
                            assistantMessageId: message.id,
                            actionId: applyTemplateEditActionId,
                            shouldRun: true,
                          });
                        }}
                        disabled={
                          !canEdit ||
                          isApplying ||
                          isHeavyProcessing ||
                          (details !== null && !details.hasTemplateEditPayload)
                        }
                      >
                        Apply & Run
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 w-8 rounded-none px-0'
                            disabled={
                              !canEdit ||
                              isApplying ||
                              isHeavyProcessing ||
                              (details !== null && !details.hasTemplateEditPayload)
                            }
                          >
                            <ChevronDown className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={() => {
                              onApplyAction({
                                assistantMessageId: message.id,
                                actionId: applyTemplateEditActionId,
                                shouldRun: false,
                              });
                            }}
                          >
                            Apply only
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
