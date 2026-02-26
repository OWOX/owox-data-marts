import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@owox/ui/components/dropdown-menu';
import { Textarea } from '@owox/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { NO_PERMISSION_MESSAGE } from '../../../../app/permissions';
import { useAiAssistant } from '../model/hooks/useAiAssistant.ts';
import type {
  AiAssistantMessageDto,
  AiAssistantScope,
  AiAssistantSessionListItemDto,
  ApplyAiAssistantSessionResponseDto,
  AssistantProposedAction,
} from '../model/types/ai-assistant.dto.ts';

interface AiAssistantPanelProps {
  dataMartId: string;
  scope: AiAssistantScope;
  templateId?: string;
  canEdit: boolean;
  onApplied?: (result: ApplyAiAssistantSessionResponseDto) => void;
}

const PANEL_STORAGE_KEY_PREFIX = 'ai_assistant_panel_collapsed';

export function AiAssistantPanel({
  dataMartId,
  scope,
  templateId,
  canEdit,
  onApplied,
}: AiAssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [lastApplyResult, setLastApplyResult] = useState<ApplyAiAssistantSessionResponseDto | null>(
    null
  );
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const storageKey = `${PANEL_STORAGE_KEY_PREFIX}:${scope}`;
    return localStorage.getItem(storageKey) === '1';
  });

  const {
    session,
    sessions,
    messages,
    lastResponse,
    resolvedContext,
    isInitializing,
    isHistoryLoading,
    isSending,
    isHeavyProcessing,
    isApplying,
    error,
    sendMessage,
    selectSession,
    startNewConversation,
    renameSession,
    deleteSession,
    apply,
  } = useAiAssistant({
    dataMartId,
    scope,
    templateId,
    enabled: Boolean(dataMartId),
  });

  useEffect(() => {
    if (!error) return;
    toast.error(error);
  }, [error]);

  const hasSqlCandidate = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== 'assistant') {
        continue;
      }
      const normalizedSql = message.sqlCandidate?.trim();
      if (normalizedSql) {
        return true;
      }
    }

    return false;
  }, [messages]);

  const assistantMessageDetailsById = useMemo(() => {
    const detailsById = new Map<string, AssistantMessageDetails>();

    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }

      detailsById.set(message.id, buildAssistantMessageDetails(message));
    }

    return detailsById;
  }, [messages]);
  const lastApplyStatusTone = useMemo(() => {
    if (!lastApplyResult) {
      return '';
    }

    if (lastApplyResult.status === 'validation_failed') {
      return 'border-red-200 bg-red-50 text-red-900';
    }

    if (lastApplyResult.status === 'updated') {
      return 'border-green-200 bg-green-50 text-green-900';
    }

    return 'border-amber-200 bg-amber-50 text-amber-900';
  }, [lastApplyResult]);
  const lastAssistantMessageContent = [...messages]
    .reverse()
    .find(message => message.role === 'assistant')?.content;
  const explanationText = lastResponse?.explanation?.trim() ?? '';
  const shouldRenderExplanationBanner =
    explanationText.length > 0 && explanationText !== (lastAssistantMessageContent?.trim() ?? '');

  const displayedSessionTitle = useMemo(() => {
    if (!session) {
      return 'AI Assistant';
    }

    return formatSessionTitle(session);
  }, [session]);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem(`${PANEL_STORAGE_KEY_PREFIX}:${scope}`, next ? '1' : '0');
  };

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text) return;
    setLastApplyResult(null);
    await sendMessage(text);
    setPrompt('');
  };

  const completeApply = (result: ApplyAiAssistantSessionResponseDto) => {
    setLastApplyResult(result);
    const statusMessage = formatApplyStatusMessage(result);

    if (result.status === 'validation_failed') {
      toast.error(statusMessage);
    } else if (result.status === 'updated') {
      toast.success(statusMessage);
    } else {
      toast(statusMessage);
    }

    onApplied?.(result);
  };

  const handleApplyAction = async (params: { assistantMessageId: string; actionId: string }) => {
    const result = await apply({
      assistantMessageId: params.assistantMessageId,
      actionId: params.actionId,
    });
    if (!result) {
      return;
    }

    completeApply(result);
  };

  const handlePromptInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSend();
  };

  const handleStartNewConversation = async () => {
    await startNewConversation();
    setLastApplyResult(null);
    setPrompt('');
    setIsHistoryView(false);
  };

  const handleSessionSelect = async (sessionId: string) => {
    await selectSession(sessionId);
    setLastApplyResult(null);
    setIsHistoryView(false);
    setRenamingSessionId(null);
    setRenameDraft('');
  };

  const handleStartRename = (item: AiAssistantSessionListItemDto) => {
    setRenamingSessionId(item.id);
    setRenameDraft(formatSessionTitle(item));
  };

  const handleCancelRename = () => {
    setRenamingSessionId(null);
    setRenameDraft('');
  };

  const handleRenameSubmit = async (sessionId: string) => {
    const nextTitle = renameDraft.trim();
    if (!nextTitle) {
      toast.error('Title cannot be empty');
      return;
    }

    const ok = await renameSession(sessionId, nextTitle);
    if (!ok) {
      return;
    }

    toast.success('Chat renamed');
    handleCancelRename();
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    toast.success('Chat deleted');
    if (session?.id === sessionId) {
      setIsHistoryView(false);
    }
  };

  return (
    <div
      className={`flex min-h-0 shrink-0 self-stretch border-r transition-all ${
        isCollapsed ? 'w-12 min-w-12' : 'w-[360px] max-w-[420px] min-w-[320px]'
      }`}
    >
      {isCollapsed ? (
        <div className='flex h-full w-full flex-col items-center justify-start gap-2 py-3'>
          <Button
            variant='ghost'
            size='icon'
            aria-label='Expand AI assistant panel'
            onClick={toggleCollapsed}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
          <div className='text-muted-foreground rotate-180 text-xs font-medium tracking-wide [writing-mode:vertical-rl]'>
            AI Assistant
          </div>
        </div>
      ) : (
        <div className='flex h-full min-h-0 w-full flex-col'>
          <div className='flex items-center justify-between border-b px-3 py-2'>
            <div className='flex min-w-0 items-center gap-2'>
              <Sparkles className='h-4 w-4 shrink-0' />
              <div className='truncate text-sm font-medium'>{displayedSessionTitle}</div>
            </div>
            <div className='flex items-center gap-1'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='inline-flex'>
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label='Start new chat'
                      onClick={() => {
                        void handleStartNewConversation();
                      }}
                      disabled={
                        !canEdit ||
                        isInitializing ||
                        isHistoryLoading ||
                        isSending ||
                        isHeavyProcessing ||
                        isApplying
                      }
                    >
                      <Plus className='h-4 w-4' />
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
              </Tooltip>
              <Button
                variant='ghost'
                size='icon'
                aria-label={isHistoryView ? 'Back to current chat' : 'Open chat history'}
                onClick={() => {
                  setIsHistoryView(prev => !prev);
                  setRenamingSessionId(null);
                  setRenameDraft('');
                }}
                disabled={isInitializing || isHistoryLoading}
              >
                {isHistoryView ? (
                  <MessageSquare className='h-4 w-4' />
                ) : (
                  <History className='h-4 w-4' />
                )}
              </Button>
              <Button
                variant='ghost'
                size='icon'
                aria-label='Collapse AI assistant panel'
                onClick={toggleCollapsed}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
            </div>
          </div>

          {isHistoryView ? (
            <div className='flex min-h-0 flex-1 flex-col'>
              <div className='min-h-0 flex-1 overflow-y-auto px-2 py-2'>
                {isHistoryLoading ? (
                  <div className='text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm'>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Loading chat history...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className='text-muted-foreground px-2 py-3 text-sm'>No chats yet.</div>
                ) : (
                  <div className='space-y-1'>
                    {sessions.map(item => {
                      const isActive = item.id === session?.id;
                      const isRenaming = renamingSessionId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`w-full rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? 'bg-muted/60 border-primary/20'
                              : 'bg-background hover:bg-muted/40 border-transparent'
                          }`}
                          role='button'
                          tabIndex={0}
                          onClick={() => {
                            void handleSessionSelect(item.id);
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              void handleSessionSelect(item.id);
                            }
                          }}
                        >
                          <div className='flex items-start gap-2'>
                            <div className='min-w-0 flex-1'>
                              {isRenaming ? (
                                <Textarea
                                  value={renameDraft}
                                  className='m-0 min-h-0 resize-none border-0 bg-transparent p-0 text-sm font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
                                  rows={1}
                                  onClick={event => {
                                    event.stopPropagation();
                                  }}
                                  onChange={event => {
                                    setRenameDraft(event.target.value);
                                  }}
                                  onBlur={() => {
                                    void handleRenameSubmit(item.id);
                                  }}
                                  onKeyDown={event => {
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleCancelRename();
                                      return;
                                    }

                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void handleRenameSubmit(item.id);
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <div className='truncate font-medium'>
                                  {formatSessionTitle(item)}
                                </div>
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
                                    handleStartRename(item);
                                  }}
                                  disabled={!canEdit}
                                >
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className='text-destructive'
                                  onClick={event => {
                                    event.stopPropagation();
                                    void handleDeleteSession(item.id);
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
                )}
              </div>
            </div>
          ) : (
            <div className='flex min-h-0 flex-1 flex-col'>
              <div className='relative min-h-0 flex-1 overflow-hidden'>
                <div className='absolute inset-0 overflow-y-auto px-3 py-2'>
                  {isInitializing ? (
                    <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Initializing assistant...
                    </div>
                  ) : messages.length > 0 ? (
                    <div className='space-y-2'>
                      {messages.map(message => {
                        const details =
                          message.role === 'assistant'
                            ? (assistantMessageDetailsById.get(message.id) ?? null)
                            : null;
                        const isApplied =
                          message.role === 'assistant' && message.applyStatus === 'applied';
                        const shouldShowActionsSection =
                          message.role === 'assistant' &&
                          (isApplied || Boolean(details?.hasActions));
                        const applyChangesActionId = details?.applyChangesAction?.id ?? null;
                        const createAndAttachActionId = details?.createAndAttachAction?.id ?? null;
                        const insertIntoTemplateActionId =
                          details?.insertIntoTemplateAction?.id ?? null;
                        const applyTemplateEditActionId =
                          details?.applyTemplateEditAction?.id ?? null;

                        return (
                          <div
                            key={message.id}
                            className={`rounded-md border px-2 py-1.5 text-sm ${
                              message.role === 'user'
                                ? 'bg-muted/40 border-muted-foreground/20'
                                : 'bg-background border-blue-100'
                            }`}
                          >
                            <div className='mb-1 text-xs font-medium capitalize'>
                              {message.role}
                            </div>
                            <div className='break-words whitespace-pre-wrap'>{message.content}</div>

                            {message.role === 'assistant' && details?.sqlCandidate && (
                              <div className='mt-3 space-y-2'>
                                <div className='flex items-center gap-1 text-xs font-medium'>
                                  <Sparkles className='text-white-600 h-3.5 w-3.5' />
                                  Generated SQL
                                </div>
                                <pre className='bg-muted overflow-x-auto rounded-md p-2 text-xs whitespace-pre-wrap'>
                                  {details.sqlCandidate}
                                </pre>
                              </div>
                            )}

                            {shouldShowActionsSection && (
                              <div className='mt-3 space-y-2'>
                                <div className='flex items-center justify-between'>
                                  <div className='text-xs font-medium'>Actions</div>
                                  {isApplied && (
                                    <div className='rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-900'>
                                      Applied
                                    </div>
                                  )}
                                </div>

                                {!isApplied && (
                                  <div className='flex flex-wrap gap-2'>
                                    {applyChangesActionId && (
                                      <Button
                                        variant='outline'
                                        size='sm'
                                        onClick={() => {
                                          void handleApplyAction({
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
                                          void handleApplyAction({
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
                                          void handleApplyAction({
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
                                      <Button
                                        variant='outline'
                                        size='sm'
                                        onClick={() => {
                                          void handleApplyAction({
                                            assistantMessageId: message.id,
                                            actionId: applyTemplateEditActionId,
                                          });
                                        }}
                                        disabled={
                                          !canEdit ||
                                          isApplying ||
                                          isHeavyProcessing ||
                                          (details !== null && !details.hasTemplateEditPayload)
                                        }
                                      >
                                        Apply template edit
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {shouldRenderExplanationBanner && (
                    <div className='mt-3 rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-xs text-blue-900'>
                      {explanationText}
                    </div>
                  )}

                  {resolvedContext?.contextResolution === 'explicit_not_found' && (
                    <div className='mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900'>
                      Please specify an existing source key from this template.
                    </div>
                  )}

                  {resolvedContext?.contextResolution === 'ambiguous_implicit' && (
                    <div className='mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900'>
                      No clear source match was found. Use <strong>Create source and attach</strong>{' '}
                      to continue.
                    </div>
                  )}

                  {lastApplyResult && (
                    <div
                      className={`mt-3 rounded-md border px-2 py-1.5 text-xs ${lastApplyStatusTone}`}
                    >
                      <div>{formatApplyStatusMessage(lastApplyResult)}</div>
                      {lastApplyResult.reason && (
                        <div className='mt-1 break-words whitespace-pre-wrap opacity-90'>
                          Reason: {lastApplyResult.reason}
                        </div>
                      )}
                    </div>
                  )}

                  {isHeavyProcessing && (
                    <div className='text-muted-foreground mt-3 flex items-center gap-2 text-xs'>
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      processing...
                    </div>
                  )}
                </div>
              </div>

              <div className='space-y-2 px-3 py-3'>
                <Textarea
                  className='min-h-32'
                  value={prompt}
                  onChange={event => {
                    setPrompt(event.target.value);
                  }}
                  onKeyDown={handlePromptInputKeyDown}
                  placeholder='Ask assistant'
                  rows={3}
                  disabled={!canEdit || isSending || isHeavyProcessing}
                />

                <div className='flex items-center gap-2'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='inline-flex'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            void handleSend();
                          }}
                          disabled={!canEdit || !prompt.trim() || isSending || isHeavyProcessing}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className='h-4 w-4 animate-spin' />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Wand2 className='h-4 w-4' />
                              {hasSqlCandidate ? 'Refine' : 'Generate'}
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                  </Tooltip>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSessionTitle(
  session: Pick<AiAssistantSessionListItemDto, 'title' | 'createdAt'>
): string {
  const normalized = (session.title ?? '').trim();
  if (normalized) {
    return normalized;
  }

  const createdAt = new Date(session.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return 'New chat';
  }

  return `New chat ${createdAt.toLocaleDateString()}`;
}

type ApplyChangesMessageAction = Extract<
  AssistantProposedAction,
  { type: 'apply_changes_to_source' | 'apply_sql_to_artifact' }
>;
type CreateAndAttachMessageAction = Extract<
  AssistantProposedAction,
  { type: 'create_source_and_attach' | 'attach_source_to_template' }
>;
type InsertIntoTemplateMessageAction = Extract<
  AssistantProposedAction,
  { type: 'reuse_source_without_changes' }
>;
type ApplyTemplateEditMessageAction = Extract<
  AssistantProposedAction,
  { type: 'replace_template_document' }
>;

interface AssistantMessageDetails {
  sqlCandidate: string;
  applyChangesAction: ApplyChangesMessageAction | null;
  createAndAttachAction: CreateAndAttachMessageAction | null;
  insertIntoTemplateAction: InsertIntoTemplateMessageAction | null;
  applyTemplateEditAction: ApplyTemplateEditMessageAction | null;
  hasTemplateEditPayload: boolean;
  hasActions: boolean;
}

function buildAssistantMessageDetails(message: AiAssistantMessageDto): AssistantMessageDetails {
  const proposedActions = Array.isArray(message.proposedActions) ? message.proposedActions : [];
  const sqlCandidate = message.sqlCandidate?.trim() ?? '';
  const applyChangesAction = (proposedActions.find(
    action => action.type === 'apply_changes_to_source' || action.type === 'apply_sql_to_artifact'
  ) ?? null) as ApplyChangesMessageAction | null;
  const createSourceAndAttachAction = (proposedActions.find(
    action =>
      action.type === 'create_source_and_attach' || action.type === 'attach_source_to_template'
  ) ?? null) as CreateAndAttachMessageAction | null;
  const insertIntoTemplateAction =
    proposedActions.find(action => action.type === 'reuse_source_without_changes') ?? null;
  const applyTemplateEditAction =
    proposedActions.find(action => action.type === 'replace_template_document') ?? null;
  const templateEditPayloadAction =
    applyTemplateEditAction ??
    createSourceAndAttachAction ??
    applyChangesAction ??
    insertIntoTemplateAction;

  let hasTemplateEditPayload = false;
  if (templateEditPayloadAction) {
    const payload = templateEditPayloadAction.payload;
    hasTemplateEditPayload = Boolean(payload.text?.trim() && Array.isArray(payload.tags));
  }

  return {
    sqlCandidate,
    applyChangesAction,
    createAndAttachAction: createSourceAndAttachAction,
    insertIntoTemplateAction,
    applyTemplateEditAction,
    hasTemplateEditPayload,
    hasActions: Boolean(
      applyChangesAction?.id ??
      createSourceAndAttachAction?.id ??
      insertIntoTemplateAction?.id ??
      applyTemplateEditAction?.id
    ),
  };
}

function formatApplyStatusMessage(result: ApplyAiAssistantSessionResponseDto): string {
  switch (result.status) {
    case 'updated':
      return formatUpdatedApplyMessage(result.reason);
    case 'already_present':
    case 'already_exists':
      return 'No changes: snippet already exists in template.';
    case 'no_op':
      return formatNoOpApplyMessage(result.reason);
    case 'validation_failed':
      return 'Template validation failed. Review the patch and try again.';
    default:
      return 'Apply finished.';
  }
}

function formatUpdatedApplyMessage(reason: string | null): string {
  if (reason === 'update_existing_source') {
    return 'Source SQL updated.';
  }

  if (reason === 'create_and_attach_source') {
    return 'Source created and attached to template.';
  }

  if (reason === 'attach_existing_source') {
    return 'Existing source attached to template.';
  }

  if (reason === 'replace_template_document') {
    return 'Template updated.';
  }

  if (reason === 'remove_source_only') {
    return 'Source removed from template sources.';
  }

  return 'Apply updated successfully.';
}

function formatNoOpApplyMessage(reason: string | null): string {
  if (reason === 'template_full_replace_no_changes') {
    return 'No changes: template is already up to date.';
  }

  return 'No changes were applied.';
}
