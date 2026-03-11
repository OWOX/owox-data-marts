import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Loader2, ArrowUp, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { trackEvent } from '../../../../utils';
import { Button } from '@owox/ui/components/button';
import { Textarea } from '@owox/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ConfirmationDialog } from '../../../../shared/components/ConfirmationDialog';
import { NO_PERMISSION_MESSAGE } from '../../../../app/permissions';
import { useAiAssistant } from '../model/ai-assistant/hooks/useAiAssistant.ts';
import type {
  AiAssistantScope,
  AiAssistantSessionListItemDto,
  ApplyAiAssistantSessionResponseDto,
} from '../model/ai-assistant/types/ai-assistant.dto.ts';
import type {
  AiAssistantPanelHandle,
  AssistantMessageDetails,
} from '../model/ai-assistant/types/ai-assistant-panel.types.ts';
import {
  buildAssistantMessageDetails,
  formatApplyStatusMessage,
  formatSessionTitle,
} from '../model/ai-assistant/utils/ai-assistant-panel.utils.ts';
import { AiAssistantSkeleton } from './ai-assistant/AiAssistantSkeleton.tsx';
import { AiAssistantHistory } from './ai-assistant/AiAssistantHistory.tsx';
import { AiAssistantMessage } from './ai-assistant/AiAssistantMessage.tsx';

interface AiAssistantPanelProps {
  dataMartId: string;
  scope: AiAssistantScope;
  templateId?: string;
  canEdit: boolean;
  isHistoryView: boolean;
  onHistoryViewChange: (show: boolean) => void;
  onBusyChange?: (isBusy: boolean) => void;
  onApplied?: (result: ApplyAiAssistantSessionResponseDto) => void;
  onRun?: () => void | Promise<void>;
}

export const AiAssistantPanel = forwardRef<AiAssistantPanelHandle, AiAssistantPanelProps>(
  function AiAssistantPanel(
    {
      dataMartId,
      scope,
      templateId,
      canEdit,
      isHistoryView,
      onHistoryViewChange,
      onBusyChange,
      onApplied,
      onRun,
    },
    ref
  ) {
    const [prompt, setPrompt] = useState('');
    const [lastApplyResult, setLastApplyResult] =
      useState<ApplyAiAssistantSessionResponseDto | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isFirstMessagesLoadRef = useRef(true);
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const [expandedSqlIds, setExpandedSqlIds] = useState<Set<string>>(new Set());

    const toggleSql = (messageId: string) => {
      setExpandedSqlIds(prev => {
        const next = new Set(prev);
        if (next.has(messageId)) {
          next.delete(messageId);
        } else {
          next.add(messageId);
        }
        return next;
      });
    };

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

    useEffect(() => {
      if (isInitializing || isHistoryView || isSending) return;

      if (messages.length === 0) {
        isFirstMessagesLoadRef.current = true;
        return;
      }

      const behavior = isFirstMessagesLoadRef.current ? 'auto' : 'smooth';

      const scroll = () => {
        messagesEndRef.current?.scrollIntoView({ behavior });
      };

      const rafId = requestAnimationFrame(() => {
        scroll();
        requestAnimationFrame(scroll);
      });

      isFirstMessagesLoadRef.current = false;

      return () => {
        cancelAnimationFrame(rafId);
      };
    }, [messages, isHeavyProcessing, isInitializing, isHistoryView, isSending]);

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

    const handleSend = async () => {
      const text = prompt.trim();
      if (!text) return;
      setLastApplyResult(null);
      await sendMessage(text);
      trackEvent({
        event: 'ai_assistant_message_sent',
        category: 'Insights',
        action: 'Send Message',
        label: session?.id ?? 'new',
        context: dataMartId,
        details: scope,
      });
      setPrompt('');
    };

    const completeApply = (result: ApplyAiAssistantSessionResponseDto) => {
      setLastApplyResult(result);
      const statusMessage = formatApplyStatusMessage(result);

      if (result.status === 'validation_failed') {
        toast.error(statusMessage);
      } else if (result.status === 'updated') {
        trackEvent({
          event: 'ai_assistant_changes_applied',
          category: 'Insights',
          action: 'Apply Changes',
          label: session?.id ?? '',
          context: dataMartId,
          details: result.status,
        });
        toast.success(statusMessage);
      } else {
        toast(statusMessage);
      }

      onApplied?.(result);
    };

    const handleApplyAction = async (params: {
      assistantMessageId: string;
      actionId: string;
      shouldRun?: boolean;
    }) => {
      const result = await apply({
        assistantMessageId: params.assistantMessageId,
        actionId: params.actionId,
      });
      if (!result) {
        return;
      }

      completeApply(result);

      if (params.shouldRun && result.status === 'updated') {
        void onRun?.();
      }
    };

    const handlePromptInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) {
        return;
      }

      event.preventDefault();
      void handleSend();
    };

    const isBusy =
      isInitializing || isHistoryLoading || isSending || isHeavyProcessing || isApplying;
    useEffect(() => {
      onBusyChange?.(isBusy);
    }, [isBusy, onBusyChange]);

    const prevIsHistoryViewRef = useRef(isHistoryView);
    useEffect(() => {
      const was = prevIsHistoryViewRef.current;
      prevIsHistoryViewRef.current = isHistoryView;
      if (was && !isHistoryView) {
        isFirstMessagesLoadRef.current = true;
        setRenamingSessionId(null);
        setRenameDraft('');
      }
    }, [isHistoryView]);

    const handleStartNewConversation = async () => {
      await startNewConversation();
      trackEvent({
        event: 'ai_assistant_new_conversation',
        category: 'Insights',
        action: 'New Conversation',
        label: session?.id ?? 'new',
        context: dataMartId,
        details: scope,
      });
      isFirstMessagesLoadRef.current = true;
      setLastApplyResult(null);
      setPrompt('');
      onHistoryViewChange(false);
    };

    useImperativeHandle(ref, () => ({
      startNewConversation: handleStartNewConversation,
    }));

    const handleSessionSelect = async (sessionId: string) => {
      await selectSession(sessionId);
      trackEvent({
        event: 'ai_assistant_session_selected',
        category: 'Insights',
        action: 'View History',
        label: sessionId,
        context: dataMartId,
      });
      isFirstMessagesLoadRef.current = true;
      setLastApplyResult(null);
      onHistoryViewChange(false);
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

      trackEvent({
        event: 'ai_assistant_session_renamed',
        category: 'Insights',
        action: 'Rename Chat',
        label: sessionId,
        context: dataMartId,
        details: nextTitle,
      });
      toast.success('Chat renamed');
      handleCancelRename();
    };

    const handleDeleteSession = async (sessionId: string) => {
      await deleteSession(sessionId);
      trackEvent({
        event: 'ai_assistant_session_deleted',
        category: 'Insights',
        action: 'Delete Chat',
        label: sessionId,
        context: dataMartId,
      });
      toast.success('Chat deleted');
      if (session?.id === sessionId) {
        onHistoryViewChange(false);
      }
    };

    return (
      <div className='flex h-full min-h-0 w-full flex-col'>
        <div className='flex h-9 shrink-0 items-center gap-2 border-b px-3'>
          <Sparkles className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
          <div className='text-muted-foreground truncate text-xs'>{displayedSessionTitle}</div>
        </div>

        {isHistoryView ? (
          <div className='flex min-h-0 flex-1 flex-col'>
            <div className='min-h-0 flex-1 overflow-y-auto px-2 py-2'>
              <AiAssistantHistory
                sessions={sessions}
                currentSessionId={session?.id}
                isHistoryLoading={isHistoryLoading}
                canEdit={canEdit}
                renamingSessionId={renamingSessionId}
                renameDraft={renameDraft}
                onSessionSelect={sessionId => {
                  void handleSessionSelect(sessionId);
                }}
                onStartRename={handleStartRename}
                onCancelRename={handleCancelRename}
                onRenameDraftChange={setRenameDraft}
                onRenameSubmit={sessionId => {
                  void handleRenameSubmit(sessionId);
                }}
                onDeleteSession={sessionId => {
                  setSessionToDelete(sessionId);
                }}
              />
            </div>
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col'>
            <div className='relative min-h-0 flex-1 overflow-hidden'>
              <div className='absolute inset-0 overflow-y-auto px-3 py-2'>
                {(isInitializing || isHistoryLoading) && !session ? (
                  <AiAssistantSkeleton />
                ) : messages.length > 0 ? (
                  <div className='space-y-3'>
                    {messages.map(message => (
                      <AiAssistantMessage
                        key={message.id}
                        message={message}
                        details={
                          message.role === 'assistant'
                            ? (assistantMessageDetailsById.get(message.id) ?? null)
                            : null
                        }
                        canEdit={canEdit}
                        isApplying={isApplying}
                        isHeavyProcessing={isHeavyProcessing}
                        expandedSqlIds={expandedSqlIds}
                        onToggleSql={toggleSql}
                        onApplyAction={params => {
                          void handleApplyAction(params);
                        }}
                      />
                    ))}
                  </div>
                ) : !isInitializing && !isHistoryLoading ? (
                  <div className='text-muted-foreground flex h-full items-center justify-center py-10 text-center text-xs'>
                    No messages yet. Start a conversation!
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

                {lastApplyResult && lastApplyResult.status !== 'updated' && (
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
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className='space-y-2 px-3 py-3'>
              <div className='relative flex flex-col'>
                <Textarea
                  className='min-h-24 pr-12 pb-10'
                  value={prompt}
                  onChange={event => {
                    setPrompt(event.target.value);
                  }}
                  onKeyDown={handlePromptInputKeyDown}
                  placeholder='Ask a question about your data…'
                  rows={2}
                  disabled={!canEdit || isSending || isHeavyProcessing}
                />

                <div className='absolute right-2 bottom-2'>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className='inline-flex'>
                        <Button
                          variant='default'
                          size='icon'
                          className='h-8 w-8 rounded-full'
                          onClick={() => {
                            void handleSend();
                          }}
                          disabled={!canEdit || !prompt.trim() || isSending || isHeavyProcessing}
                        >
                          {isSending ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <ArrowUp className='h-4 w-4' />
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!canEdit && <TooltipContent>{NO_PERMISSION_MESSAGE}</TooltipContent>}
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmationDialog
          open={!!sessionToDelete}
          onOpenChange={() => {
            setSessionToDelete(null);
          }}
          onConfirm={() => {
            if (sessionToDelete) {
              void handleDeleteSession(sessionToDelete);
              setSessionToDelete(null);
            }
          }}
          title='Delete Chat'
          description='Are you sure you want to delete this chat session? This action cannot be undone.'
          confirmLabel='Delete'
          variant='destructive'
        />
      </div>
    );
  }
);
