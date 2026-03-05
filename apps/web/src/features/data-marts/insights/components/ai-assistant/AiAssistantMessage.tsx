import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { AiAssistantMessageDto } from '../../model/ai-assistant/types/ai-assistant.dto.ts';
import type { AssistantMessageDetails } from '../../model/ai-assistant/types/ai-assistant-panel.types.ts';
import { ACTION_LABELS } from '../../model/ai-assistant/utils/action-labels.ts';
import { SqlPreview } from './SqlPreview.tsx';
import { SplitActionButton } from './SplitActionButton.tsx';

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
                    <SplitActionButton
                      label={ACTION_LABELS.applyChanges}
                      onApply={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: applyChangesActionId,
                          shouldRun: true,
                        });
                      }}
                      onApplyOnly={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: applyChangesActionId,
                          shouldRun: false,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    />
                  )}
                  {createAndAttachActionId && (
                    <SplitActionButton
                      label={ACTION_LABELS.createAndAttach}
                      onApply={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: createAndAttachActionId,
                          shouldRun: true,
                        });
                      }}
                      onApplyOnly={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: createAndAttachActionId,
                          shouldRun: false,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    />
                  )}
                  {insertIntoTemplateActionId && (
                    <SplitActionButton
                      label={ACTION_LABELS.reuseSource}
                      onApply={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: insertIntoTemplateActionId,
                          shouldRun: true,
                        });
                      }}
                      onApplyOnly={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: insertIntoTemplateActionId,
                          shouldRun: false,
                        });
                      }}
                      disabled={!canEdit || isApplying || isHeavyProcessing}
                    />
                  )}
                  {applyTemplateEditActionId && (
                    <SplitActionButton
                      label={ACTION_LABELS.applyTemplateEdit}
                      onApply={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: applyTemplateEditActionId,
                          shouldRun: true,
                        });
                      }}
                      onApplyOnly={() => {
                        onApplyAction({
                          assistantMessageId: message.id,
                          actionId: applyTemplateEditActionId,
                          shouldRun: false,
                        });
                      }}
                      disabled={
                        !canEdit ||
                        isApplying ||
                        isHeavyProcessing ||
                        (details !== null && !details.hasTemplateEditPayload)
                      }
                    />
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
