import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AssistantChatMessage } from '../ai-insights/agent-flow/ai-assistant-types';
import {
  AgentFlowConversationSnapshot,
  AgentFlowConversationSnapshotSchema,
  AgentFlowPromptContext,
  AgentFlowStateSnapshot,
  AgentFlowStateSnapshotActionDigest,
  AgentFlowStateSnapshotSqlRevision,
  AgentFlowStateSnapshotSource,
} from '../ai-insights/agent-flow/types';
import { AiAssistantContext } from '../entities/ai-assistant-context.entity';
import { AiAssistantMessage } from '../entities/ai-assistant-message.entity';
import { AiAssistantSession } from '../entities/ai-assistant-session.entity';
import { AiAssistantMessageRole } from '../enums/ai-assistant-message-role.enum';
import { AiSourceApplyService } from './ai-source-apply.service';
import { AiAssistantContextService } from './ai-assistant-context.service';
import { AiAssistantSessionService } from './ai-assistant-session.service';
import type { AiAssistantSessionApplyActionSnapshot } from './ai-assistant-session.service.types';
import { AgentFlowHistorySnapshotAgent } from './agent-flow-history-snapshot-agent.service';
import { InsightArtifactService } from './insight-artifact.service';
import { InsightTemplateService } from './insight-template.service';

const MAX_RECENT_TURN_CHARS = 1200;
const MAX_RECENT_TURNS = 12;
const MAX_CONTEXT_CHARS = 12000;
const MAX_SNAPSHOT_SOURCES = 40;
const MAX_ACTION_DIGEST_ITEMS = 30;
const MAX_SQL_REVISIONS = 5;
const SQL_PREVIEW_CHARS = 600;

const SNAPSHOT_TAIL_TURNS = 3;
const SNAPSHOT_COMPACT_BATCH = 8;

interface BuildAgentFlowPromptContextInput {
  session: AiAssistantSession;
  dataMartId: string;
  projectId: string;
  userId: string;
  sessionMessages: AiAssistantMessage[];
}

interface TurnTimelineEntry {
  role: AiAssistantMessageRole;
  content: string;
  createdAt: Date;
}

@Injectable()
export class AgentFlowContextManager {
  constructor(
    private readonly aiAssistantContextService: AiAssistantContextService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly insightTemplateService: InsightTemplateService,
    private readonly aiAssistantSessionService: AiAssistantSessionService,
    private readonly aiSourceApplyService: AiSourceApplyService,
    private readonly historySnapshotAgent: AgentFlowHistorySnapshotAgent
  ) {}

  async buildPromptContext(
    input: BuildAgentFlowPromptContextInput
  ): Promise<AgentFlowPromptContext> {
    const [storedContext, applySnapshots, appliedActions] = await Promise.all([
      this.aiAssistantContextService.getBySessionId(input.session.id),
      this.aiAssistantSessionService.listApplyActionSnapshotsBySession({
        sessionId: input.session.id,
        createdById: input.userId,
      }),
      this.aiSourceApplyService.listAppliedBySession(input.session.id, input.userId),
    ]);

    const turnTimeline = this.buildTurnTimeline(input.sessionMessages, appliedActions);
    const conversationSnapshot = await this.buildConversationSnapshot(
      storedContext?.conversationSnapshot ?? null,
      turnTimeline
    );
    const actionDigests = this.buildActionDigests(applySnapshots);

    const stateSnapshot = await this.buildStateSnapshot({
      session: input.session,
      dataMartId: input.dataMartId,
      projectId: input.projectId,
      actionDigests,
      sessionMessages: input.sessionMessages,
    });

    const context = this.applyContextBudget(
      {
        recentTurns: this.buildRecentTurnsForPrompt(turnTimeline, conversationSnapshot),
        conversationSnapshot,
        stateSnapshot,
      },
      turnTimeline
    );

    await this.persistContext({
      sessionId: input.session.id,
      storedContext,
      conversationSnapshot: context.conversationSnapshot,
      stateSnapshot: context.stateSnapshot,
    });

    return context;
  }

  private buildTurnTimeline(
    messages: AiAssistantMessage[],
    appliedActions: Array<{
      actionType: string | null;
      sourceKey: string | null;
      artifactTitle: string | null;
      templateUpdated: boolean;
      appliedAt: Date;
    }>
  ): AssistantChatMessage[] {
    const entries: TurnTimelineEntry[] = [
      ...messages.map(message => ({
        role: message.role,
        content: this.normalizeTurnContent(message.content),
        createdAt: message.createdAt ?? new Date(0),
      })),
      ...appliedActions.map(action => ({
        role: AiAssistantMessageRole.USER,
        content: this.formatAppliedActionEvent(action),
        createdAt: action.appliedAt,
      })),
    ]
      .filter(entry => entry.content.length > 0)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

    return entries.map(entry => ({
      role: entry.role,
      content: entry.content,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  private async buildConversationSnapshot(
    storedSnapshot: AgentFlowConversationSnapshot | null,
    turnTimeline: AssistantChatMessage[]
  ): Promise<AgentFlowConversationSnapshot | null> {
    if (turnTimeline.length <= MAX_RECENT_TURNS) {
      return null;
    }

    const tailSize = Math.min(SNAPSHOT_TAIL_TURNS, turnTimeline.length);
    const targetCompressedTurns = turnTimeline.length - tailSize;
    if (targetCompressedTurns <= 0) {
      return null;
    }

    const normalizedStored = this.normalizeStoredConversationSnapshot(
      storedSnapshot,
      turnTimeline.length
    );
    const compressedTurns = normalizedStored?.compressedTurns ?? 0;
    const turnsToCompress = turnTimeline.slice(compressedTurns, targetCompressedTurns);

    if (!normalizedStored || turnsToCompress.length >= SNAPSHOT_COMPACT_BATCH) {
      const snapshotContent = await this.historySnapshotAgent.buildSnapshot({
        existingSnapshot: normalizedStored,
        turnsToCompress,
      });

      return {
        ...snapshotContent,
        compressedTurns: targetCompressedTurns,
        updatedAt: new Date().toISOString(),
      };
    }

    return normalizedStored;
  }

  private normalizeStoredConversationSnapshot(
    snapshot: AgentFlowConversationSnapshot | null,
    totalTurns: number
  ): AgentFlowConversationSnapshot | null {
    if (!snapshot) {
      return null;
    }

    const parsedSnapshot = AgentFlowConversationSnapshotSchema.safeParse(snapshot);
    if (!parsedSnapshot.success) {
      return null;
    }

    const compressedTurns = Number.isFinite(snapshot.compressedTurns)
      ? Math.max(0, Math.min(Math.floor(snapshot.compressedTurns), totalTurns))
      : 0;

    return {
      ...parsedSnapshot.data,
      compressedTurns,
    };
  }

  private buildRecentTurnsForPrompt(
    turnTimeline: AssistantChatMessage[],
    conversationSnapshot: AgentFlowConversationSnapshot | null
  ): AssistantChatMessage[] {
    if (!conversationSnapshot) {
      return turnTimeline.slice(-MAX_RECENT_TURNS);
    }

    const startIndex = Math.max(
      0,
      Math.min(conversationSnapshot.compressedTurns, turnTimeline.length)
    );
    const turnsAfterSnapshot = turnTimeline.slice(startIndex);
    if (turnsAfterSnapshot.length > 0) {
      return turnsAfterSnapshot;
    }

    return turnTimeline.slice(-Math.min(SNAPSHOT_TAIL_TURNS, turnTimeline.length));
  }

  private async buildStateSnapshot(params: {
    session: AiAssistantSession;
    dataMartId: string;
    projectId: string;
    sessionMessages: AiAssistantMessage[];
    actionDigests: {
      appliedActions: AgentFlowStateSnapshotActionDigest[];
      pendingActions: AgentFlowStateSnapshotActionDigest[];
    };
  }): Promise<AgentFlowStateSnapshot> {
    const sources = await this.buildSnapshotSources(
      params.session,
      params.dataMartId,
      params.projectId
    );
    const sqlRevisions = this.buildSqlRevisions(params.sessionMessages);

    return {
      sessionId: params.session.id,
      templateId: params.session.templateId ?? null,
      sources,
      appliedActions: params.actionDigests.appliedActions,
      pendingActions: params.actionDigests.pendingActions,
      sqlRevisions,
    };
  }

  private buildActionDigests(applySnapshots: AiAssistantSessionApplyActionSnapshot[]): {
    appliedActions: AgentFlowStateSnapshotActionDigest[];
    pendingActions: AgentFlowStateSnapshotActionDigest[];
  } {
    const sortedSnapshots = [...applySnapshots].sort(
      (left, right) => right.modifiedAt.getTime() - left.modifiedAt.getTime()
    );

    const appliedSnapshots = sortedSnapshots.filter(
      snapshot => snapshot.lifecycleStatus === 'applied'
    );
    const latestAppliedAt = appliedSnapshots[0]?.modifiedAt.getTime() ?? null;
    const pendingSnapshots = sortedSnapshots.filter(
      snapshot => snapshot.lifecycleStatus === 'created'
    );
    const relevantPendingSnapshots =
      latestAppliedAt == null
        ? pendingSnapshots
        : pendingSnapshots.filter(snapshot => snapshot.modifiedAt.getTime() > latestAppliedAt);

    return {
      appliedActions: appliedSnapshots
        .slice(0, MAX_ACTION_DIGEST_ITEMS)
        .map(snapshot => this.toActionDigest(snapshot)),
      pendingActions: relevantPendingSnapshots
        .slice(0, MAX_ACTION_DIGEST_ITEMS)
        .map(snapshot => this.toActionDigest(snapshot)),
    };
  }

  private async buildSnapshotSources(
    session: AiAssistantSession,
    dataMartId: string,
    projectId: string
  ): Promise<AgentFlowStateSnapshotSource[]> {
    const templateId = session.templateId;
    if (!templateId) {
      return [];
    }

    const template = await this.insightTemplateService.getByIdAndDataMartIdAndProjectId(
      templateId,
      dataMartId,
      projectId
    );
    if (!template) {
      return [];
    }

    const sources = template.sources ?? [];
    const artifactIds = [
      ...new Set(
        sources.map(source => source.artifactId).filter((value): value is string => Boolean(value))
      ),
    ];

    const artifacts =
      artifactIds.length > 0
        ? await this.insightArtifactService.listByIdsAndDataMartIdAndProjectId({
            artifactIds,
            dataMartId,
            projectId,
          })
        : [];

    const artifactsById = new Map(artifacts.map(artifact => [artifact.id, artifact]));

    return sources.slice(0, MAX_SNAPSHOT_SOURCES).map(source => {
      const artifactId = source.artifactId;
      const artifact = artifactId ? artifactsById.get(artifactId) : undefined;
      const sql = artifact?.sql;

      return {
        sourceKey: source.key,
        artifactId: artifactId ?? null,
        artifactTitle: artifact?.title ?? null,
        isAttachedToTemplate: true,
        sqlHash: sql ? this.buildSqlHash(sql) : null,
        sqlPreview: sql ? sql.slice(0, SQL_PREVIEW_CHARS) : null,
        updatedAt: artifact?.modifiedAt?.toISOString() ?? null,
      };
    });
  }

  private applyContextBudget(
    context: AgentFlowPromptContext,
    turnTimeline: AssistantChatMessage[]
  ): AgentFlowPromptContext {
    const trimmedTurns = [...context.recentTurns];
    const lastUserTurn = this.getLastUserTurn(turnTimeline);

    while (
      this.measureContextChars({ ...context, recentTurns: trimmedTurns }) > MAX_CONTEXT_CHARS &&
      trimmedTurns.length > 1
    ) {
      trimmedTurns.shift();
    }

    if (lastUserTurn && !trimmedTurns.some(turn => turn.role === AiAssistantMessageRole.USER)) {
      trimmedTurns.unshift(lastUserTurn);
    }

    return {
      recentTurns: trimmedTurns.slice(-MAX_RECENT_TURNS),
      conversationSnapshot: context.conversationSnapshot,
      stateSnapshot: context.stateSnapshot,
    };
  }

  private async persistContext(params: {
    sessionId: string;
    storedContext: AiAssistantContext | null;
    conversationSnapshot: AgentFlowConversationSnapshot | null;
    stateSnapshot: AgentFlowStateSnapshot;
  }): Promise<void> {
    await this.aiAssistantContextService.saveIfChanged(params);
  }

  private normalizeTurnContent(value: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length <= MAX_RECENT_TURN_CHARS) {
      return normalized;
    }

    return normalized.slice(0, MAX_RECENT_TURN_CHARS);
  }

  private getLastUserTurn(turns: AssistantChatMessage[]): AssistantChatMessage | null {
    const reversed = [...turns].reverse();
    return reversed.find(turn => turn.role === AiAssistantMessageRole.USER) ?? null;
  }

  private formatAppliedActionEvent(action: {
    actionType: string | null;
    sourceKey: string | null;
    artifactTitle: string | null;
    templateUpdated: boolean;
  }): string {
    const parts: string[] = ['[Action applied]'];
    if (action.actionType) {
      parts.push(action.actionType);
    }
    if (action.sourceKey) {
      parts.push(`source: "${action.sourceKey}"`);
    }
    if (action.artifactTitle) {
      parts.push(`"${action.artifactTitle}"`);
    }
    parts.push(action.templateUpdated ? 'template updated' : 'template not changed');

    return this.normalizeTurnContent(parts.join(' - '));
  }

  private toActionDigest(
    snapshot: AiAssistantSessionApplyActionSnapshot
  ): AgentFlowStateSnapshotActionDigest {
    return {
      requestId: snapshot.requestId,
      assistantMessageId: snapshot.assistantMessageId,
      lifecycleStatus: snapshot.lifecycleStatus,
      modifiedAt: snapshot.modifiedAt.toISOString(),
    };
  }

  private buildSqlHash(sql: string): string {
    return createHash('sha256').update(sql).digest('hex');
  }

  private buildSqlRevisions(
    sessionMessages: AiAssistantMessage[]
  ): AgentFlowStateSnapshotSqlRevision[] {
    const revisions: AgentFlowStateSnapshotSqlRevision[] = [];

    for (const message of [...sessionMessages].reverse()) {
      if (message.role !== AiAssistantMessageRole.ASSISTANT) {
        continue;
      }

      const normalizedSql = this.normalizeSqlCandidate(message.sqlCandidate);
      if (!normalizedSql) {
        continue;
      }

      revisions.push({
        sqlRevisionId: message.id,
        sqlPreview: normalizedSql.slice(0, SQL_PREVIEW_CHARS),
        createdAt: (message.createdAt ?? new Date(0)).toISOString(),
      });

      if (revisions.length >= MAX_SQL_REVISIONS) {
        break;
      }
    }

    return revisions;
  }

  private normalizeSqlCandidate(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private measureContextChars(context: AgentFlowPromptContext): number {
    return JSON.stringify(context).length;
  }
}
