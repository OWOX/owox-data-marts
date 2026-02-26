import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { extractApiError } from '../../../../../app/api';
import { TaskStatus } from '../../../../../shared/types/task-status.enum.ts';
import { aiAssistantService } from '../services/ai-assistant.service.ts';
import type {
  AiAssistantMessageDto,
  AiAssistantScope,
  AiAssistantSessionDto,
  AiAssistantSessionListItemDto,
  ApplyAiAssistantSessionResponseDto,
  ListAiAssistantSessionsRequestDto,
  AssistantMatchDebug,
  AssistantOrchestratorResponse,
  AssistantProposedAction,
  AssistantRouteTraceMeta,
  AssistantResolvedContext,
} from '../types/ai-assistant.dto.ts';

interface UseAiAssistantParams {
  dataMartId: string;
  scope: AiAssistantScope;
  templateId?: string;
  enabled?: boolean;
}

interface ApplyOptions {
  actionId: string;
  assistantMessageId?: string;
  sql?: string;
  artifactTitle?: string;
}

interface UseAiAssistantResult {
  session: AiAssistantSessionDto | null;
  sessions: AiAssistantSessionListItemDto[];
  messages: AiAssistantMessageDto[];
  lastResponse: AssistantOrchestratorResponse | null;
  activeAssistantMessageId: string | null;
  activeRouteTrace: AssistantRouteTraceMeta | null;
  proposedActions: AssistantProposedAction[];
  resolvedContext: AssistantResolvedContext | null;
  matchDebug: AssistantMatchDebug | null;
  sqlCandidate: string;
  suggestedSourceKey: string;
  suggestedArtifactTitle: string;
  resolvedSourceKey: string;
  resolvedArtifactTitle: string;
  isInitializing: boolean;
  isHistoryLoading: boolean;
  isSending: boolean;
  isHeavyProcessing: boolean;
  isApplying: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  apply: (options: ApplyOptions) => Promise<ApplyAiAssistantSessionResponseDto | null>;
  refreshSession: () => Promise<void>;
}

const FINAL_TRIGGER_STATUSES = [
  TaskStatus.SUCCESS,
  TaskStatus.ERROR,
  TaskStatus.CANCELLED,
] as const;
const POLLING_INTERVAL = 1500;
const ASSISTANT_ORCHESTRATOR_ROUTES = [
  'full_generation',
  'refine_existing_sql',
  'explain_or_status',
  'clarify',
  'reuse_existing_source',
  'refine_existing_source_sql',
  'create_new_source_sql',
  'edit_template_text',
] as const;
const TURN_PROMPT_TYPES = ['template_edit', 'explain_or_status', 'source_task'] as const;
const ASSISTANT_TASK_MODES = ['new_task', 'refine_existing', 'ambiguous_mode'] as const;

interface LastOrchestratorSnapshot {
  response: AssistantOrchestratorResponse;
  assistantMessageId: string;
  routeTrace: AssistantRouteTraceMeta | null;
}

type AssistantRouteTraceOutcome = NonNullable<AssistantRouteTraceMeta['candidateOutcomes']>[number];

export function useAiAssistant({
  dataMartId,
  scope,
  templateId,
  enabled = true,
}: UseAiAssistantParams): UseAiAssistantResult {
  const [session, setSession] = useState<AiAssistantSessionDto | null>(null);
  const [sessions, setSessions] = useState<AiAssistantSessionListItemDto[]>([]);
  const [messages, setMessages] = useState<AiAssistantMessageDto[]>([]);
  const [lastResponse, setLastResponse] = useState<AssistantOrchestratorResponse | null>(null);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null);
  const [activeRouteTrace, setActiveRouteTrace] = useState<AssistantRouteTraceMeta | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isHeavyProcessing, setIsHeavyProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTriggerRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const safeSetState = useCallback((callback: () => void) => {
    if (!isMountedRef.current) {
      return;
    }
    callback();
  }, []);

  const updateFromSession = useCallback((nextSession: AiAssistantSessionDto) => {
    const previousSessionId = activeSessionIdRef.current;
    const nextMessages = nextSession.messages;
    const snapshot = findLastOrchestratorSnapshot(nextMessages);
    setSession(nextSession);
    setMessages(nextMessages);
    setLastResponse(previous => {
      if (previousSessionId && previousSessionId !== nextSession.id) {
        return snapshot?.response ?? null;
      }

      if (!snapshot?.response) {
        return null;
      }

      return mergeOrchestratorResponse(previous, snapshot.response);
    });
    setActiveAssistantMessageId(snapshot?.assistantMessageId ?? null);
    setActiveRouteTrace(snapshot?.routeTrace ?? null);
    activeSessionIdRef.current = nextSession.id;
  }, []);

  const listParams = useMemo<ListAiAssistantSessionsRequestDto>(() => {
    return {
      scope,
      templateId,
      limit: 50,
      offset: 0,
    };
  }, [scope, templateId]);

  const fetchSessions = useCallback(async (): Promise<AiAssistantSessionListItemDto[]> => {
    if (!dataMartId) {
      return [];
    }
    return aiAssistantService.listSessions(dataMartId, listParams);
  }, [dataMartId, listParams]);

  const createSessionForCurrentContext = useCallback(async (): Promise<string> => {
    const created = await aiAssistantService.createSession(dataMartId, {
      scope,
      templateId: templateId ?? undefined,
    });

    return created.sessionId;
  }, [dataMartId, scope, templateId]);

  const refreshSessionList = useCallback(async (): Promise<AiAssistantSessionListItemDto[]> => {
    const nextSessions = await fetchSessions();
    safeSetState(() => {
      setSessions(nextSessions);
    });
    return nextSessions;
  }, [fetchSessions, safeSetState]);

  const loadSessionById = useCallback(
    async (sessionId: string): Promise<AiAssistantSessionDto> => {
      const loaded = await aiAssistantService.getSession(dataMartId, sessionId);
      safeSetState(() => {
        updateFromSession(loaded);
      });
      return loaded;
    },
    [dataMartId, safeSetState, updateFromSession]
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    if (!dataMartId || !session?.id) {
      return;
    }

    await loadSessionById(session.id);
    await refreshSessionList();
  }, [dataMartId, loadSessionById, refreshSessionList, session?.id]);

  const abortActiveTrigger = useCallback(async (): Promise<void> => {
    const activeTrigger = activeTriggerRef.current;
    if (!activeTrigger || !dataMartId) {
      return;
    }

    activeTriggerRef.current = null;
    safeSetState(() => {
      setIsHeavyProcessing(false);
    });

    try {
      await aiAssistantService.abortRunTrigger(dataMartId, activeTrigger);
    } catch {
      // ignore abort errors while switching/resetting chat
    }
  }, [dataMartId, safeSetState]);

  const pollHeavyTrigger = useCallback(
    async (triggerId: string): Promise<void> => {
      activeTriggerRef.current = triggerId;
      safeSetState(() => {
        setIsHeavyProcessing(true);
      });

      while (activeTriggerRef.current === triggerId && isMountedRef.current) {
        try {
          const { status } = await aiAssistantService.getRunTriggerStatus(dataMartId, triggerId);

          if (!FINAL_TRIGGER_STATUSES.includes(status as (typeof FINAL_TRIGGER_STATUSES)[number])) {
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
            continue;
          }

          if (status === TaskStatus.SUCCESS) {
            const triggerResponse = await aiAssistantService.getRunTriggerResponse(
              dataMartId,
              triggerId
            );

            if ('error' in triggerResponse) {
              safeSetState(() => {
                setError(triggerResponse.error);
              });
            } else {
              safeSetState(() => {
                setLastResponse(triggerResponse.response);
                setActiveAssistantMessageId(triggerResponse.assistantMessageId);
              });
            }
          } else if (status === TaskStatus.ERROR) {
            safeSetState(() => {
              setError('AI assistant generation failed');
            });
          } else if (status === TaskStatus.CANCELLED) {
            safeSetState(() => {
              setError('AI assistant generation was cancelled');
            });
          }

          activeTriggerRef.current = null;
          safeSetState(() => {
            setIsHeavyProcessing(false);
          });

          await refreshSession();
          return;
        } catch (cause) {
          const apiError = extractApiError(cause);
          safeSetState(() => {
            setError(apiError.message ?? 'Failed to poll AI assistant generation status');
            setIsHeavyProcessing(false);
          });
          activeTriggerRef.current = null;
          return;
        }
      }
    },
    [dataMartId, refreshSession, safeSetState]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const activeTrigger = activeTriggerRef.current;
      activeTriggerRef.current = null;
      if (activeTrigger && dataMartId) {
        void aiAssistantService.abortRunTrigger(dataMartId, activeTrigger);
      }
    };
  }, [dataMartId]);

  useEffect(() => {
    if (!enabled || !dataMartId) {
      return;
    }

    let cancelled = false;

    const init = async (): Promise<void> => {
      setIsInitializing(true);
      setIsHistoryLoading(true);
      setError(null);
      setSession(null);
      setSessions([]);
      setMessages([]);
      setLastResponse(null);
      setActiveAssistantMessageId(null);
      setActiveRouteTrace(null);
      activeSessionIdRef.current = null;

      try {
        let nextSessions = await aiAssistantService.listSessions(dataMartId, listParams);

        let initialSessionId = nextSessions[0]?.id;
        if (!initialSessionId) {
          initialSessionId = await createSessionForCurrentContext();
          nextSessions = await aiAssistantService.listSessions(dataMartId, listParams);
        }

        if (cancelled || !initialSessionId) {
          return;
        }

        const loaded = await aiAssistantService.getSession(dataMartId, initialSessionId);
        safeSetState(() => {
          setSessions(nextSessions);
          updateFromSession(loaded);
        });
      } catch (cause) {
        const apiError = extractApiError(cause);
        if (!cancelled) {
          safeSetState(() => {
            setError(apiError.message ?? 'Failed to initialize AI assistant assistant');
          });
        }
      } finally {
        if (!cancelled) {
          safeSetState(() => {
            setIsInitializing(false);
            setIsHistoryLoading(false);
          });
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [
    createSessionForCurrentContext,
    dataMartId,
    enabled,
    listParams,
    safeSetState,
    scope,
    updateFromSession,
  ]);

  const selectSession = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!dataMartId || !sessionId || session?.id === sessionId) {
        return;
      }

      setError(null);
      setIsHistoryLoading(true);

      try {
        await abortActiveTrigger();
        await loadSessionById(sessionId);
      } catch (cause) {
        const apiError = extractApiError(cause);
        safeSetState(() => {
          setError(apiError.message ?? 'Failed to load chat session');
        });
      } finally {
        safeSetState(() => {
          setIsHistoryLoading(false);
        });
      }
    },
    [abortActiveTrigger, dataMartId, loadSessionById, safeSetState, session?.id]
  );

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      const prompt = text.trim();
      if (!prompt || !session?.id || !dataMartId) {
        return;
      }

      setIsSending(true);
      setError(null);

      try {
        const response = await aiAssistantService.createMessage(dataMartId, session.id, {
          text: prompt,
          correlationId: crypto.randomUUID(),
        });
        const userRouteTrace = parseRouteTraceMeta(response.response?.meta?.routeTrace ?? null);

        safeSetState(() => {
          setMessages(prev => [
            ...prev,
            response.userMessage,
            ...(response.assistantMessage ? [response.assistantMessage] : []),
          ]);
        });

        if (response.mode === 'heavy' && response.triggerId) {
          safeSetState(() => {
            setActiveAssistantMessageId(null);
            setActiveRouteTrace(userRouteTrace);
          });
          void pollHeavyTrigger(response.triggerId);
        } else if (response.response) {
          const lightweightResponse = response.response;
          safeSetState(() => {
            setLastResponse(lightweightResponse);
            setActiveAssistantMessageId(response.assistantMessage?.id ?? null);
            setActiveRouteTrace(
              userRouteTrace ?? parseRouteTraceMeta(lightweightResponse.meta?.routeTrace ?? null)
            );
          });
          void refreshSession();
        }

        void refreshSessionList();
      } catch (cause) {
        const apiError = extractApiError(cause);
        safeSetState(() => {
          setError(apiError.message ?? 'Failed to send AI assistant message');
        });
      } finally {
        safeSetState(() => {
          setIsSending(false);
        });
      }
    },
    [dataMartId, pollHeavyTrigger, refreshSession, refreshSessionList, safeSetState, session?.id]
  );

  const startNewConversation = useCallback(async (): Promise<void> => {
    if (!enabled || !dataMartId) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      await abortActiveTrigger();
      const sessionId = await createSessionForCurrentContext();
      await loadSessionById(sessionId);
      await refreshSessionList();
    } catch (cause) {
      const apiError = extractApiError(cause);
      safeSetState(() => {
        setError(apiError.message ?? 'Failed to start new conversation');
      });
    } finally {
      safeSetState(() => {
        setIsInitializing(false);
      });
    }
  }, [
    abortActiveTrigger,
    createSessionForCurrentContext,
    dataMartId,
    enabled,
    loadSessionById,
    refreshSessionList,
    safeSetState,
  ]);

  const renameSession = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      const nextTitle = title.trim();
      if (!nextTitle || !dataMartId) {
        return false;
      }

      try {
        const updated = await aiAssistantService.updateSessionTitle(dataMartId, sessionId, {
          title: nextTitle,
        });

        safeSetState(() => {
          setSessions(prev =>
            prev
              .map(item => (item.id === sessionId ? updated : item))
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          );
          setSession(prev =>
            prev?.id === sessionId ? { ...prev, title: updated.title ?? null } : prev
          );
        });

        return true;
      } catch (cause) {
        const apiError = extractApiError(cause);
        safeSetState(() => {
          setError(apiError.message ?? 'Failed to rename chat');
        });
        return false;
      }
    },
    [dataMartId, safeSetState]
  );

  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!dataMartId) {
        return;
      }

      setError(null);
      setIsHistoryLoading(true);

      try {
        await abortActiveTrigger();
        await aiAssistantService.deleteSession(dataMartId, sessionId);

        const nextSessions = await aiAssistantService.listSessions(dataMartId, listParams);
        safeSetState(() => {
          setSessions(nextSessions);
        });

        if (session?.id && session.id !== sessionId) {
          return;
        }

        const nextSessionId = nextSessions[0]?.id;
        if (nextSessionId) {
          await loadSessionById(nextSessionId);
          return;
        }

        const createdSessionId = await createSessionForCurrentContext();
        await loadSessionById(createdSessionId);
        await refreshSessionList();
      } catch (cause) {
        const apiError = extractApiError(cause);
        safeSetState(() => {
          setError(apiError.message ?? 'Failed to delete chat');
        });
      } finally {
        safeSetState(() => {
          setIsHistoryLoading(false);
        });
      }
    },
    [
      abortActiveTrigger,
      createSessionForCurrentContext,
      dataMartId,
      listParams,
      loadSessionById,
      refreshSessionList,
      safeSetState,
      session?.id,
    ]
  );

  const apply = useCallback(
    async (options: ApplyOptions): Promise<ApplyAiAssistantSessionResponseDto | null> => {
      if (!session?.id || !dataMartId) return null;

      const preferredAssistantMessageId = options.assistantMessageId?.trim();
      const effectiveAssistantMessageId =
        preferredAssistantMessageId && preferredAssistantMessageId.length > 0
          ? preferredAssistantMessageId
          : activeAssistantMessageId;
      if (!effectiveAssistantMessageId) {
        setError(
          'Apply snapshot is unavailable. Send a new message and wait for assistant response.'
        );
        return null;
      }

      const responseForApply =
        effectiveAssistantMessageId === activeAssistantMessageId
          ? lastResponse
          : findOrchestratorResponseByAssistantMessageId(messages, effectiveAssistantMessageId);

      const selectedAction = responseForApply?.proposedActions?.find(
        action => action.id === options.actionId
      );
      if (!selectedAction) {
        setError('Selected apply action is unavailable. Generate a new assistant response.');
        return null;
      }

      const trimmedSql = options.sql?.trim();
      const requiresSql = requiresSqlApplyAction(selectedAction);
      const effectiveSql = requiresSql
        ? trimmedSql && trimmedSql.length > 0
          ? trimmedSql
          : (responseForApply?.result?.sqlCandidate ?? '')
        : undefined;

      if (requiresSql && !effectiveSql) {
        setError('SQL candidate is empty. Generate SQL first.');
        return null;
      }

      setIsApplying(true);
      setError(null);
      try {
        const response = await aiAssistantService.applySession(dataMartId, session.id, {
          requestId: options.actionId,
          assistantMessageId: effectiveAssistantMessageId,
          sql: effectiveSql,
          artifactTitle: options.artifactTitle,
        });

        await refreshSession();
        return response;
      } catch (cause) {
        const apiError = extractApiError(cause);
        setError(apiError.message ?? 'Failed to apply assistant action');
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    [activeAssistantMessageId, dataMartId, lastResponse, messages, refreshSession, session?.id]
  );

  const proposedActions = useMemo<AssistantProposedAction[]>(() => {
    return lastResponse?.proposedActions ?? [];
  }, [lastResponse?.proposedActions]);

  const resolvedContext = useMemo<AssistantResolvedContext | null>(() => {
    return lastResponse?.resolvedContext ?? null;
  }, [lastResponse?.resolvedContext]);

  const matchDebug = useMemo<AssistantMatchDebug | null>(() => {
    return lastResponse?.debug ?? null;
  }, [lastResponse?.debug]);

  const suggestedSourceKey = useMemo(() => {
    if (proposedActions.length === 0) return '';

    for (const action of proposedActions) {
      if (action.type === 'attach_source_to_template' && action.payload.suggestedSourceKey) {
        return action.payload.suggestedSourceKey;
      }

      if (action.type === 'create_source_and_attach' && action.payload.suggestedSourceKey) {
        return action.payload.suggestedSourceKey;
      }

      if (action.type === 'reuse_source_without_changes' && action.payload.sourceKey) {
        return action.payload.sourceKey;
      }
    }

    return '';
  }, [proposedActions]);

  const suggestedArtifactTitle = useMemo(() => {
    if (proposedActions.length === 0) return '';

    for (const action of proposedActions) {
      if (action.type === 'apply_sql_to_artifact' && action.payload.suggestedArtifactTitle) {
        return action.payload.suggestedArtifactTitle;
      }

      if (action.type === 'apply_changes_to_source' && action.payload.suggestedArtifactTitle) {
        return action.payload.suggestedArtifactTitle;
      }

      if (action.type === 'create_source_and_attach' && action.payload.suggestedArtifactTitle) {
        return action.payload.suggestedArtifactTitle;
      }

      if (action.type === 'attach_source_to_template' && action.payload.suggestedArtifactTitle) {
        return action.payload.suggestedArtifactTitle;
      }
    }

    return '';
  }, [proposedActions]);

  const resolvedArtifactTitle = useMemo(() => {
    if (suggestedArtifactTitle.trim()) {
      return suggestedArtifactTitle;
    }

    return 'Untitled source';
  }, [suggestedArtifactTitle]);

  const resolvedSourceKey = useMemo(() => {
    if (suggestedSourceKey.trim()) {
      return suggestedSourceKey;
    }

    if (resolvedArtifactTitle.trim()) {
      return resolvedArtifactTitle;
    }

    return 'source';
  }, [resolvedArtifactTitle, suggestedSourceKey]);

  return {
    session,
    sessions,
    messages,
    lastResponse,
    activeAssistantMessageId,
    activeRouteTrace,
    proposedActions,
    resolvedContext,
    matchDebug,
    sqlCandidate: lastResponse?.result?.sqlCandidate ?? '',
    suggestedSourceKey,
    suggestedArtifactTitle,
    resolvedSourceKey,
    resolvedArtifactTitle,
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
    refreshSession,
  };
}

function findLastOrchestratorSnapshot(
  messages: AiAssistantMessageDto[]
): LastOrchestratorSnapshot | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') {
      continue;
    }
    const parsedResponse = buildOrchestratorResponseFromMessage(message);
    if (!parsedResponse) {
      continue;
    }

    return {
      response: parsedResponse,
      assistantMessageId: message.id,
      routeTrace: null,
    };
  }

  return null;
}

function findOrchestratorResponseByAssistantMessageId(
  messages: AiAssistantMessageDto[],
  assistantMessageId: string
): AssistantOrchestratorResponse | null {
  const assistantMessage = messages.find(
    message => message.id === assistantMessageId && message.role === 'assistant'
  );
  if (!assistantMessage) {
    return null;
  }

  return buildOrchestratorResponseFromMessage(assistantMessage);
}

function buildOrchestratorResponseFromMessage(
  message: AiAssistantMessageDto
): AssistantOrchestratorResponse | null {
  const normalizedSqlCandidate =
    typeof message.sqlCandidate === 'string' && message.sqlCandidate.trim().length > 0
      ? message.sqlCandidate.trim()
      : undefined;
  const proposedActions = parseMessageProposedActions(message.proposedActions);
  if (!proposedActions && !normalizedSqlCandidate) {
    return null;
  }

  return {
    status: 'ok',
    decision: proposedActions ? 'propose_action' : 'explain',
    proposedActions: proposedActions ?? undefined,
    result: normalizedSqlCandidate ? { sqlCandidate: normalizedSqlCandidate } : undefined,
  };
}

function parseMessageProposedActions(rawActions: unknown): AssistantProposedAction[] | null {
  if (!Array.isArray(rawActions)) {
    return null;
  }

  const proposedActions = rawActions.filter(isSourceProposedAction);
  return proposedActions.length > 0 ? proposedActions : null;
}

function isSourceProposedAction(value: unknown): value is AssistantProposedAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    id?: unknown;
    confidence?: unknown;
    payload?: unknown;
  };

  if (
    typeof candidate.type !== 'string' ||
    typeof candidate.id !== 'string' ||
    typeof candidate.confidence !== 'number' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object' ||
    Array.isArray(candidate.payload)
  ) {
    return false;
  }

  return (
    candidate.type === 'attach_source_to_template' ||
    candidate.type === 'apply_sql_to_artifact' ||
    candidate.type === 'apply_changes_to_source' ||
    candidate.type === 'create_source_and_attach' ||
    candidate.type === 'replace_template_document' ||
    candidate.type === 'remove_source_from_template' ||
    candidate.type === 'reuse_source_without_changes'
  );
}

function mergeOrchestratorResponse(
  previous: AssistantOrchestratorResponse | null,
  next: AssistantOrchestratorResponse | null
): AssistantOrchestratorResponse | null {
  if (!next) {
    return previous;
  }

  if (!previous) {
    return next;
  }

  return {
    status: previous.status,
    decision: previous.decision,
    result: next.result ?? previous.result,
    proposedActions: next.proposedActions ?? previous.proposedActions,
    resolvedContext: next.resolvedContext ?? previous.resolvedContext,
    debug: next.debug ?? previous.debug,
    explanation: next.explanation ?? previous.explanation,
    meta: next.meta ?? previous.meta,
  };
}

function parseRouteTraceMeta(rawRouteTrace: unknown): AssistantRouteTraceMeta | null {
  if (!rawRouteTrace || typeof rawRouteTrace !== 'object') {
    return null;
  }

  const candidate = rawRouteTrace as {
    route?: unknown;
    finalRoute?: unknown;
    reasonDescription?: unknown;
    promptType?: unknown;
    sourceTaskMode?: unknown;
    path?: unknown;
    nodeDecisions?: unknown;
    nodes?: unknown;
    decisionTraceId?: unknown;
    resolvedContext?: unknown;
    matchConfidence?: unknown;
    matchReason?: unknown;
    candidateOutcomes?: unknown;
  };

  const route = parseEnumValue(candidate.route, ASSISTANT_ORCHESTRATOR_ROUTES);
  const finalRoute = parseEnumValue(candidate.finalRoute, ASSISTANT_ORCHESTRATOR_ROUTES) ?? route;
  const nodeDecisions =
    parseUnknownRecord(candidate.nodeDecisions) ?? parseUnknownRecord(candidate.nodes);
  const candidateOutcomes = Array.isArray(candidate.candidateOutcomes)
    ? candidate.candidateOutcomes
        .filter(outcome => Boolean(parseUnknownRecord(outcome)))
        .map(outcome => outcome as AssistantRouteTraceOutcome)
    : undefined;

  const routeTrace: AssistantRouteTraceMeta = {
    route,
    finalRoute,
    reasonDescription:
      typeof candidate.reasonDescription === 'string' ? candidate.reasonDescription : undefined,
    promptType: parseEnumValue(candidate.promptType, TURN_PROMPT_TYPES),
    sourceTaskMode: parseEnumValue(candidate.sourceTaskMode, ASSISTANT_TASK_MODES),
    path: typeof candidate.path === 'string' ? candidate.path : undefined,
    nodeDecisions,
    decisionTraceId:
      typeof candidate.decisionTraceId === 'string' ? candidate.decisionTraceId : undefined,
    resolvedContext: parseResolvedContext(candidate.resolvedContext),
    matchConfidence:
      typeof candidate.matchConfidence === 'number' ? candidate.matchConfidence : undefined,
    matchReason: typeof candidate.matchReason === 'string' ? candidate.matchReason : undefined,
    candidateOutcomes,
  };

  if (
    routeTrace.route === undefined &&
    routeTrace.finalRoute === undefined &&
    routeTrace.reasonDescription === undefined &&
    routeTrace.promptType === undefined &&
    routeTrace.sourceTaskMode === undefined &&
    routeTrace.path === undefined &&
    routeTrace.nodeDecisions === undefined &&
    routeTrace.decisionTraceId === undefined &&
    routeTrace.resolvedContext === undefined &&
    routeTrace.matchConfidence === undefined &&
    routeTrace.matchReason === undefined &&
    routeTrace.candidateOutcomes === undefined
  ) {
    return null;
  }

  return routeTrace;
}

function parseResolvedContext(value: unknown): AssistantResolvedContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as {
    targetSourceKey?: unknown;
    targetArtifactId?: unknown;
    targetKind?: unknown;
    contextResolution?: unknown;
  };

  const resolvedContext: AssistantResolvedContext = {
    targetSourceKey:
      typeof candidate.targetSourceKey === 'string' ? candidate.targetSourceKey : undefined,
    targetArtifactId:
      typeof candidate.targetArtifactId === 'string' ? candidate.targetArtifactId : undefined,
    targetKind:
      candidate.targetKind === 'TABLE' || candidate.targetKind === 'VALUE'
        ? candidate.targetKind
        : undefined,
    contextResolution:
      candidate.contextResolution === 'explicit_key' ||
      candidate.contextResolution === 'inferred_key' ||
      candidate.contextResolution === 'inferred_unlinked_artifact' ||
      candidate.contextResolution === 'none' ||
      candidate.contextResolution === 'ambiguous_implicit' ||
      candidate.contextResolution === 'explicit_not_found'
        ? candidate.contextResolution
        : undefined,
  };

  if (
    resolvedContext.targetSourceKey === undefined &&
    resolvedContext.targetArtifactId === undefined &&
    resolvedContext.targetKind === undefined &&
    resolvedContext.contextResolution === undefined
  ) {
    return undefined;
  }

  return resolvedContext;
}

function parseUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  variants: T
): T[number] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return variants.includes(value as T[number]) ? (value as T[number]) : undefined;
}

function requiresSqlApplyAction(action: AssistantProposedAction): boolean {
  switch (action.type) {
    case 'apply_sql_to_artifact':
    case 'apply_changes_to_source':
    case 'create_source_and_attach':
      return true;
    case 'attach_source_to_template':
      return !action.payload.targetArtifactId;
    default:
      return false;
  }
}
